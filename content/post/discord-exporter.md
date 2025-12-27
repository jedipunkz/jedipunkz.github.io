+++
title = "Prometheus Exporter 開発で Discord サーバ運営の健全化を図る"
description = "Discord サーバのメンバー数やチャネルごとのメッセージ数を Prometheus Exporter を Go を使って開発した話を記します"
aliases = [
  "/blog/2025/11/08/discord-exporter",
  "/post/2025/11/08/discord-exporter"
]
date = "2025-11-08"
Categories = ["prometheus", "grafana", "bot"]
+++

自分は Discord でゲームコミュニティを運営していて Discord サーバを管理しています。運営のために必要な情報を集めようと思い、ボット開発や Prometheus Exporter の開発をしています。この記事では Prometheus Exporter について書こうと思います。


## Discord Exporter の概要

Discord Exporter は、Discord サーバの統計情報を Prometheus メトリクスとしてエクスポートするツールです。メンバー数と各チャネルのメッセージ数を収集し Prometheus Exporter としてメトリクスを Promehteus Server に提供するものです。

[https://github.com/jedipunkz/discord-exporter](https://github.com/jedipunkz/discord-exporter)

## コードの要所説明

Discord Exporter の主要な処理を解説していきます。

### Discord API 呼び出し処理

#### メンバー情報の取得

updateMemberCount 関数では、Discord の GuildMembers API エンドポイントを呼び出してメンバー情報を取得します。API の制限により最大1000件単位でメンバーを取得し、取得したメンバー数を Prometheus のゲージメトリクスに設定します。

```go
func updateMemberCount(s *discordgo.Session, guildID string) {
    members, err := s.GuildMembers(guildID, "", 1000)
    if err != nil {
        log.Printf("Error fetching members: %v", err)
        return
    }
    memberCountGauge.Set(float64(len(members)))
    log.Printf("Updated member count: %d", len(members))
}
```

#### メッセージカウント処理

countChannelMessages 関数では、チャネルのメッセージを段階的に取得します。ChannelMessages API で100件ずつメッセージを取得し、最終メッセージの ID を次のリクエストのアンカーとして使用することで、全メッセージを数え上げるまでループ処理を行います。

```go
func countChannelMessages(s *discordgo.Session, channelID string) (int, error) {
    count := 0
    lastID := ""

    for {
        messages, err := s.ChannelMessages(channelID, 100, lastID, "", "")
        if err != nil {
            return 0, err
        }

        if len(messages) == 0 {
            break
        }

        count += len(messages)
        lastID = messages[len(messages)-1].ID
    }

    return count, nil
}
```

### メトリクス収集の実装

#### 並行処理とレート制限

Discord API への過度な呼び出しを防ぐため、セマフォを使用した並行処理制御を実装しています。最大5チャネルを同時処理できるように制限し各ゴルーチンが処理前にセマフォを取得、完了後に解放する仕組みで効率的かつ安全に複数チャネルを並行処理します。

```go
func updateMessageCounts(s *discordgo.Session, guildID string, excludedChannels []string) {
    channels, err := s.GuildChannels(guildID)
    if err != nil {
        log.Printf("Error fetching channels: %v", err)
        return
    }

    sem := make(chan struct{}, 5) // 最大5並列
    var wg sync.WaitGroup

    for _, channel := range channels {
        if channel.Type != discordgo.ChannelTypeGuildText {
            continue
        }

        // 除外チャネルをスキップ
        if contains(excludedChannels, channel.Name) {
            continue
        }

        wg.Add(1)
        go func(ch *discordgo.Channel) {
            defer wg.Done()
            sem <- struct{}{}        // セマフォ取得
            defer func() { <-sem }() // セマフォ解放

            count, err := countChannelMessages(s, ch.ID)
            if err != nil {
                log.Printf("Error counting messages in %s: %v", ch.Name, err)
                return
            }

            messageCountGauge.WithLabelValues(ch.Name).Set(float64(count))
            log.Printf("Channel: %s, Messages: %d", ch.Name, count)
        }(channel)
    }

    wg.Wait()
}
```

#### フィルタリング機能

テキストチャネルのみを対象とし、設定ファイルで指定された除外チャネルをスキップする機能を実装しています。これにより、不要なチャネルのメトリクス収集を避けることができます。

### Prometheus へのエクスポート

#### メトリクス定義

Prometheus のメトリクスとして、memberCountGauge と messageCountGauge を事前登録します。messageCountGauge はチャネル名をラベルとするラベル付きゲージとして定義されています。

```go
var (
    memberCountGauge = promauto.NewGauge(prometheus.GaugeOpts{
        Name: "discord_members_count",
        Help: "Total number of members in the Discord server",
    })

    messageCountGauge = promauto.NewGaugeVec(prometheus.GaugeOpts{
        Name: "discord_message_count",
        Help: "Total number of messages in each Discord channel",
    }, []string{"channel"})
)
```

#### HTTP エンドポイント

promhttp.Handler() を使用して /metrics エンドポイントをポート2112で提供します。Prometheus はこのエンドポイントをスクレイプしてメトリクスを収集します。

```go
func main() {
    // ... Discord セッション初期化など ...

    go startMetricsCollector(dg, config.GuildID, config.ExcludedChannels)

    http.Handle("/metrics", promhttp.Handler())
    log.Println("Starting HTTP server on :2112")
    log.Fatal(http.ListenAndServe(":2112", nil))
}
```

#### 定期更新

startMetricsCollector 関数が15分間隔で両メトリクスを自動更新し、常に最新の状態を保ちます。

```go
func startMetricsCollector(s *discordgo.Session, guildID string, excludedChannels []string) {
    ticker := time.NewTicker(15 * time.Minute)
    defer ticker.Stop()

    // 初回実行
    updateMemberCount(s, guildID)
    updateMessageCounts(s, guildID, excludedChannels)

    for range ticker.C {
        updateMemberCount(s, guildID)
        updateMessageCounts(s, guildID, excludedChannels)
    }
}
```

## Grafana での可視化

Prometheus で収集したメトリクスを Grafana で可視化することで、Discord サーバの活動状況を定期的に見ています。なので Prometheus Server も別途起動して運用しています。このあたりは docker compose を使って管理しています。

### 可視化の内容

以下のような可視化が可能です。

- メンバー数の時系列推移: サーバへの参加者数の増減をグラフで確認
- チャネル別メッセージ数: どのチャネルが活発かを比較
- メッセージ数の時系列推移: チャネルごとの活動量の変化を追跡

![grafana](/pix/discord-exporter-grafana.png)

## 自作ボットを介した表示

これとは別に Go で Discord ボットを開発して運用しています。ボットに指示するとメンバー数の推移を返してくれる様に仕掛けています。これで自分以外のメンバも推移を把握することが出来ています。ボットのコードは運営しているサーバの特性似合わせた記述がかなり入っているので GitHub レポジトリを公開していませんが、キャプチャ画面だけ貼り付けておきます。

(一部メッセージ出力にエラーが出ていますが ...)

![bot](/pix/discord-exporter-bot.png)

## まとめ

Discord Exporter とボット開発を通じて コミュニティの状態をを可視化し健全な運営ができているのかを観測出来る状態になりました。これによってデータドリブンな運用判断が可能になります。Discord でコミュニティを運営している方はぜひ試してみてください。
