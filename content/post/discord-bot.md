---
title: "Discord サーバ運営を補助する Go 実装のボット開発"
description: "Go で Discord ボットを開発。Prometheus と DuckDB を用いて分析や可視化を行い、運営に必要な機能追加を行うことで運営の補助をしてもらっている話を記します"
date: 2025-12-30T12:00:00+09:00
tags: ["Discord", "Go", "DuckDB", "Prometheus", "Grafana", "Docker"]
categories: ["Application"]
draft: false
---
自分は Discord サーバの運営を行っているのですがその運営の補助をしてもらうためにボット開発を行っています。Go で Discord ボットを開発しメンバー数の推移やログ分析を行うシステムを構築している話とまたその他幾つか機能をもっていて日々の作業の効率化を図っています。この記事ではそのボットの紹介をさせて頂きます。

※ 以前の記事 https://jedipunkz.github.io/post/discord-exporter/ の内容を含んでいます

## システム構成

このシステムは以下の3つの主要コンポーネントで構成されています。

1. **Discord ボット(padawan)** - Go 製の Discord ボット
2. **discord-exporter** - Go 実装の Discord サーバメトリクス収集用 Prometheus Exporter
3. **分析基盤** - DuckDB を用いた構造化ログの分析コンテナ

構成図は下記になります。Prometheus Exporter は Discord API から情報を取得し Prometheus Server にメトリクスを提供。Prometheus Server はそのメトリクスをポーリングしストレージにデータを蓄積。Grafana はそれをデータソースとして参照。padawan は Go 実装のボットで Discord API やその他ゲーム用 API 等を参照し機能提供。ボットと隣接してある DuckDB コンテナはボットのログを分析するための Go 実装の CLI を備える。

![Discord Bot Architecture](/pix/discord-bot-architecture.png)

----

## 構成の詳細

### ボットの構成

padawan と名前のボットとそのボットのログを分析する DuckDB コンテナで構成されています。


```yaml
# padawan/docker-compose.yaml
services:
  padawan:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ./data:/root/data
      - ./logs:/logs
    restart: always

  duckdb:
    build:
      context: .
      dockerfile: Dockerfile.duckdb
    volumes:
      - ./logs:/logs:ro
    restart: "no"
    profiles:
      - tools
```

### discord-exporter の構成

Go 実装の Discord API から情報を収集する Exporter を中心とし Grafana, Prometheus Server を構成としても持っています。

```yaml
# discord-exporter/docker-compose.yaml
version: '3'
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
    ports:
      - 9090:9090

  exporter:
    build: .
    ports:
      - 2112:2112
    restart: always

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards
      - ./grafana/provisioning/datasources:/etc/grafana/provisioning/datasources
    environment:
      - GF_SECURITY_ADMIN_USER=${ADMIN_USER}
      - GF_SECURITY_ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
      - GF_RENDERING_SERVER_URL=http://renderer:8081/render
      - GF_RENDERING_CALLBACK_URL=http://grafana:3000
      - GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=grafana-image-renderer
    restart: unless-stopped
    ports:
      - 3000:3000
    labels:
      org.label-schema.group: "monitoring"
```

----

## ボットの主要機能

### スラッシュコマンド

ボットの主要機能である `/padawan get-members-count` コマンドは、discord-exporter が収集したメトリクスを Grafana でグラフ化し、PNG 画像として Discord に投稿します。

下記のように結果を出力してくれます。

![Discord Bot Members](/pix/discord-bot-members.png)

```go:internal/pkg/discord/slash_command.go
func (c *Client) handleMemberCountCommand(s *discordgo.Session, i *discordgo.InteractionCreate, days int) error {
    if err := s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
        Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
    }); err != nil {
        return fmt.Errorf("failed to defer interaction response: %w", err)
    }

    img, err := c.getMemberCountImage(days)
    if err != nil {
        return err
    }

    if err := c.sendImageToChannel(s, i.ChannelID, img); err != nil {
        return err
    }

    successMsg := fmt.Sprintf("%d日分のメンバー数の推移です", days)
    if _, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
        Content: &successMsg,
    }); err != nil {
        return fmt.Errorf("failed to edit interaction response: %w", err)
    }

    return nil
}
```

ボットは Grafana API を利用してダッシュボードから直接画像を取得します。

```go:internal/pkg/grafana/grafana.go
func (g *Grafana) DownloadImage(days int) (io.Reader, error) {
    client := &http.Client{}

    g.RenderURL = fmt.Sprintf(
        "%s/render/d-solo/%s/fa261e90-1713-5b03-ad60-5b4a77b14e92?panelId=%s&width=1000&height=500&orgId=1&from=now-%dd&to=now",
        grafanaURL, g.DashboardUid, g.PanelId, days)

    req, err := http.NewRequest("GET", g.RenderURL, nil)
    if err != nil {
        return nil, err
    }
    req.Header.Add("Authorization", "Bearer "+g.APIKey)

    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    buf := new(bytes.Buffer)
    _, err = io.Copy(buf, resp.Body)
    if err != nil {
        return nil, err
    }

    return buf, nil
}
```

### 一時的ボイスチャンネル管理

`/voice` コマンドにより、ユーザーが任意の名前で一時的なボイスチャンネルを作成できます。チャンネルは以下の条件で自動削除されます。この機能ができるまではメンバーが新しいゲームをやろうとしても「雑談」や「その他ゲーム」というボイスチャンネルを利用するしかありませんでした。

- 全員が退出した時点
- 作成後5分間誰も参加しなかった場合

動作としては下記のような結果を出力しメンバーがボイスチャンネルに入れるようリンクを表示します。

![Discord Bot Tmp Channel](/pix/discord-bot-tmp-channel.png)

実装のコードの一部を記します。下記はハンドラー部分のコードです。

```go:internal/pkg/discord/slash_command.go
func (c *Client) handleVoiceCommand(s *discordgo.Session, i *discordgo.InteractionCreate, channelName string) error {
    c.TempChannelsMutex.RLock()
    currentCount := len(c.TempChannels)
    c.TempChannelsMutex.RUnlock()

    if currentCount >= MaxTempChannels {
        return fmt.Errorf("maximum temporary channels limit reached: %d", MaxTempChannels)
    }

    channel, err := s.GuildChannelCreateComplex(guildID, discordgo.GuildChannelCreateData{
        Name:     channelName,
        Type:     discordgo.ChannelTypeGuildVoice,
        ParentID: categoryID,
    })
    if err != nil {
        return fmt.Errorf("failed to create voice channel: %w", err)
    }

    c.TempChannelsMutex.Lock()
    c.TempChannels[channel.ID] = &TempChannelInfo{
        HasMembers: false,
        CreatedAt:  time.Now(),
    }
    c.TempChannelsMutex.Unlock()

    go c.scheduleUnusedChannelDeletion(s, channel.ID, guildID, 5*time.Minute)

    return nil
}
```


### Minecraft ゲーマータグから XUID を検索する機能

自分たちはマイクラのサーバを起動してメンバーに提供しているのですがホワイトリスト管理するため XUID をサーバに登録してログイン出来るようにしています。その XUID を検索するための機能です。

![Discord Bot Minecraft](/pix/discord-bot-minecraft.png)

### Minecraft バージョンアップ通知機能

マイクラはサーババージョンとクライアントバージョンが一致していないとログインが出来ません。クライアント側は皆のパソコンの Microsoft ストアが自動的にアップデートするのですが、サーバ側は手動になります。その手動操作の必要性に管理者である自分が素早く気がつけるよう通知機能を作りました。


![Discord Bot Minecraft Version Check](/pix/discord-bot-minecraft-version.png)

### Apex Legends の機能 x 2

APEX サーバが障害が発生しているケースはだいぶ減りましたが、遊んでいる感に異常を感じた際にサーバー状態がどうなっているかを知る機能と、APEX はマップが時間によってローテーション掛かるのですが、今の時間帯のマップと次のマップ情報を出力する機能を作成しました。

![Discord Bot APEX](/pix/discord-bot-apex.png)

### ロール管理とリマインダー機能

Discord サーバではメンバーが入った際に自己紹介をしてもらいスタンプを管理者である自分が付ける事で特定のロールを付与しボイスチャンネル等に入れるフローになっています。そのスタンプを付与する機能も追加と、また自己紹介がまだの方に毎週末にメンション付きで通知する機能を作りました。

![Discord Bot Role Check](/pix/discord-bot-role-check.png)

### ウェルカムメッセージの自動送信

また自己紹介があまりにも短い方には「既存メンバーにあなた自信のことを知ってもらえる内容で書いて」と返信する機能をボットに追加しています。いままでは自分が行っていたのですが、自分自身あまりいい気持ちではないのでボットにやらせることにしました。

----

## 構造化ログと DuckDB による分析

### 構造化ログの実装

ボットの全ての動作は JSON 形式の構造化ログとして保存されます。これは後の DuckDB での分析を考慮したものになっています。

- 時系列分析対応: Date、Time フィールドの分離により効率的な時間範囲クエリが可能
- 重要度による分析: Severity フィールドによる数値範囲クエリ
- コンテキスト保持: 各イベントに関連する詳細情報を Context として記録
- デバッグ支援: ソースコード位置の自動記録

```go:internal/pkg/logger/logger.go
type LogEntry struct {
    Timestamp string                 `json:"timestamp"`           // ISO8601 format
    Date      string                 `json:"date"`                // YYYY-MM-DD format
    Time      string                 `json:"time"`                // HH:mm:ss.SSS format
    Level     LogLevel               `json:"level"`               // ログレベル
    Severity  int                    `json:"severity"`            // 数値による重要度
    Message   string                 `json:"message"`
    EventType string                 `json:"event_type,omitempty"`
    Context   map[string]interface{} `json:"context,omitempty"`
    Source    Source                 `json:"source"`              // ソースコード位置
}

type Source struct {
    File     string `json:"file"`
    Function string `json:"function"`
    Line     int    `json:"line"`
}
```


### DuckDB クエリツールの実装

ログ分析用の専用コマンドラインツールも Go で書いています。この CLI を介して DuckDB コンテナの duckdb コマンドを実行します。クエリ分析時の手間を減らせるように読み込みファイルの指定と VIEW の作成を自動化しているのみの小さいコマンドラインツールになっています。

```go:cmd/query/main.go
func runQuery(query string) {
    fullQuery := fmt.Sprintf("CREATE VIEW logs AS SELECT * FROM read_json_auto('/logs/padawan.log'); %s", query)

    cmd := exec.Command("/usr/local/bin/duckdb", "-c", fullQuery)
    cmd.Stdout = os.Stdout
    cmd.Stderr = os.Stderr

    if err := cmd.Run(); err != nil {
        fmt.Printf("error: %v\n", err)
        os.Exit(1)
    }
}
```

### 実際の分析例

実運用環境での分析例とその結果を紹介します。

#### 1. ボイスチャンネル使用状況の分析

最も利用されているボイスチャンネルを特定

```bash
sudo docker compose run --rm duckdb "SELECT context.channel_name, COUNT(*) as count FROM logs WHERE event_type='voice_event' GROUP BY context.channel_name ORDER BY count DESC LIMIT 5"
┌─────────────────────┬───────┐
│    channel_name     │ count │
│       varchar       │ int64 │
├─────────────────────┼───────┤
│ Deep Rock Galactic  │    30 │
│ APEX#カジュアル#1   │    26 │
│ APEX#ランク#1       │    12 │
│ APEX#カジュアル#2   │     8 │
│ 雑談/その他のゲーム │     8 │
└─────────────────────┴───────┘
```

この結果から、Deep Rock Galactic が最も人気のゲームチャンネルであることがわかります。

#### 2. Discord メッセージ活動の監視

メッセージ作成イベントの詳細を表示

```bash
sudo docker compose run --rm duckdb "SELECT * FROM logs WHERE event_type='message_create' LIMIT 5"
WARN[0000] Found orphan containers ([duck-ui]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.
┌──────────────────────┬────────────┬──────────────┬───┬──────────────────┬────────────────┬──────────────────────┬──────────────────────┐
│      timestamp       │    date    │     time     │ … │     message      │   event_type   │       context        │        source        │
│       varchar        │    date    │     time     │   │     varchar      │    varchar     │ struct(path varcha…  │ struct(file varcha…  │
├──────────────────────┼────────────┼──────────────┼───┼──────────────────┼────────────────┼──────────────────────┼──────────────────────┤
│ 2025-12-26T22:32:2…  │ 2025-12-26 │ 22:32:25.464 │ … │ Message received │ message_create │ {'path': NULL, 're…  │ {'file': message.g…  │
│ 2025-12-26T22:45:3…  │ 2025-12-26 │ 22:45:36.941 │ … │ Message received │ message_create │ {'path': NULL, 're…  │ {'file': message.g…  │
│ 2025-12-26T22:45:5…  │ 2025-12-26 │ 22:45:52.022 │ … │ Message received │ message_create │ {'path': NULL, 're…  │ {'file': message.g…  │
│ 2025-12-26T23:12:2…  │ 2025-12-26 │ 23:12:22.561 │ … │ Message received │ message_create │ {'path': NULL, 're…  │ {'file': message.g…  │
│ 2025-12-26T23:14:1…  │ 2025-12-26 │ 23:14:17.505 │ … │ Message received │ message_create │ {'path': NULL, 're…  │ {'file': message.g…  │
├──────────────────────┴────────────┴──────────────┴───┴──────────────────┴────────────────┴──────────────────────┴──────────────────────┤
│ 5 rows                                                                                                             9 columns (7 shown) │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 3. メッセージ内容の詳細分析

実際のメッセージ内容を確認。メッセージ内容もログに出力され分析出来るので Discord アプリ上でメンバが削除したコメントも後に追うことが出来ます。

```bash
sudo docker compose run --rm duckdb "SELECT context.content FROM logs WHERE event_type='message_create' LIMIT 3"
┌──────────────────────────────────────────────────────────────────────────┐
│                                 content                                  │
│                                 varchar                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ 外気温０度、個人的にはこれぐらいが一番過ごしやすいな…                    │
│ 外気温…?                                                                 │
│ かき氷食べ放題…！焼き肉のたれを用意するのだ                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                  3 rows                                  │
└──────────────────────────────────────────────────────────────────────────┘
```


これらの分析により、Discord サーバの利用パターン、人気コンテンツ、アクティビティのピーク時間などの貴重な洞察を得ることができます。

----

## Discord サーバメトリクス収集のための Prometheus Exporter の実装

discord-exporter は Prometheus 形式でメトリクスを公開し、以下の情報を継続的に収集します。

1. メンバー数監視: Discord API を利用してサーバの総メンバー数を取得
2. チャンネル別メッセージ数: 各テキストチャンネルの総メッセージ数を収集

### 並行処理による高速化

```go
const maxConcurrentChannels = 5

func updateMessageCount(session *discordgo.Session, config *Config) {
    // チャンネル一覧の取得と除外チャンネルのフィルタリング
    var activeChannels []*discordgo.Channel
    for _, channel := range channels {
        if channel.Type != discordgo.ChannelTypeGuildText {
            continue // テキストチャンネル以外をスキップ
        }
        if _, excluded := config.ExcludedChannels[channel.Name]; excluded {
            continue // 除外チャンネルをスキップ
        }
        activeChannels = append(activeChannels, channel)
    }

    // セマフォを使用した並行処理制御
    semaphore := make(chan struct{}, maxConcurrentChannels)
    var wg sync.WaitGroup

    for _, channel := range activeChannels {
        wg.Add(1)
        go func(ch *discordgo.Channel) {
            defer wg.Done()
            semaphore <- struct{}{} // セマフォ取得
            defer func() { <-semaphore }() // セマフォ解放

            totalCount, err := countChannelMessages(session, ch.ID)
            if err == nil {
                messageCountGauge.WithLabelValues(ch.Name).Set(float64(totalCount))
            }
        }(channel)
    }

    wg.Wait()
}
```

### メトリクス仕様

**discord_members_count**
- 型: Gauge
- 説明: Discord サーバの総メンバー数
- 更新間隔: 15分

**discord_message_count{channel="channel_name"}**
- 型: GaugeVec
- ラベル: channel（チャンネル名）
- 説明: チャンネル別の総メッセージ数
- 更新間隔: 15分

----

## まとめ

このような形で運用の手助けになっているボットですが、まだ改善点があるかなと思っています。 特に DuckDB のクエリは今サーバに入って duckdb コンテナを指し示して自作 CLI を経由しクエリ分析していますが、Discord アプリのコメントで行いたいです。

また、新しいゲームを皆が遊ぶようになれば都度それらの機能を作っていこうと思っています。

あとはデプロイが今 `git pull` してコンテナビルド・起動とやっているのですが、自動化も行っていきたいです。
