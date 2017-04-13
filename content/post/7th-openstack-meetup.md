+++
title = "第7回 OpenStack 勉強会参加レポート"
date = "2012-08-29"
slug = "2012/08/29/7th-openstack-meetup"
Categories = ["infrastructure", "report"]
+++
第7回 OpenStack 勉強会に参加してきました。

    開催日   : 2012年08月28日
	開催場所 : 天王洲アイル ビットアイル

1年以上前から OpenStack, CloudStack 界隈はウォッチしていたのだけど、実際に構築
してってなると、今月始めばかりで、OpenStack も先週4日間掛けてやっとこさ構築出来たっ
てところ...orz。前回のブログ記事でへなちょこスクリプト公開しちゃったのを後悔しつ
つ現地に向かいましたw あと、その他に Opscode Chef 等の技術にも興味持って調査し
ていたので、今回の勉強会はまさに直ぐに活かせる内容だった。

では早速、報告があった内容と自分の感想を交えつつ書いていきます。

HP さんのクラウドサービス HP Cloud Services
----

    日本 HP 真壁さま

HP さんは既に Public クラウドサービスを提供し始めていて Ojbect Storage, CDN 部
分は既にリリース済みだそうだ。compute, block storage 等はベータ版状態でこれか
らリリース。OpenStack ベースな構成で Horizon 部分は自前で開発したもの。既
にサーバ数は万の桁まで到達！ MySQL な DaaS も登場予定だとか。

あと HP だけにクラウドサービスに特化したサーバ機器も出していて、それが HP
Project Moonshot 。ARM/Atom 搭載のサーバで 2,880 nodes/rack が可能だとか！す
げぇ。もちろん電源等のボトルネックとなるリソースは他にも出てきそうだけど。

ノード数って増えると嬉しいのかな？コア数が増えるのは嬉しいけど。

Canonical JuJu
----

    Canonical 松本さま

JuJu は Canonical が提供しているデプロイツールで charms と呼ばれるレシピ集 (っ
て言うと語弊があるのか) に従ってソフトウェアの配布を行うツール。MAAS という物
理サーバのプロビジョニングツールと組み合わせればハードウェアを設置した後のプロ
ビジョニング操作は一気通貫出来る、といったもの。具体的な操作例を挙げてくれたの
で添付してきます。

    % juju deploy --repository=/tmp swift-proxy
    % juju deploy --repository=/tmp swift-storage
    % juju add-relation swift-storage:swift-proxy
    % swift-proxy:swift-proxy
    % juju add-unit swift-storage # node 追加

swift-proxy, swift-storage をデプロイし、その後それぞれを関係付けているのが
add-relation。また swift-proxy に対して swift-storage node を追加してくといっ
た操作が add-unit らしい。

Charms と呼ばれるモノの中をのぞかせてもらったが Shell Script と json ファイル
集になっていた。インフラ系のエンジニアに操作してもらうにはこれがベスト、といっ
たところなのだろう。Opscode Chef の様な自由度があるかどうかは、触ってみないと
分からない。時間を見つけて調べてみるかぁ。

ちなにみ今日 MAAS について調べたのですが、これは PXE Boot と DHCP のコンフィギュ
レーションを GUI でするってものなのですね。後に出てくる Crowbar とはだいぶ違う。
間違っていたら指摘してください..。

参考 URL : [https://wiki.ubuntu.com/ServerTeam/MAAS](https://wiki.ubuntu.com/ServerTeam/MAAS)

RedHat の OpenStack への取り組み
----

    RedHat 中井さま

OpenStack ディストリビューションを提供し始めたことで最近話題になっていたが、い
よいよ今年2012年10月リリース予定の folsom をベースとしたリリースを2013年に控え
ているそうだ。ここで初めて有償サポートが開始されるそう。より簡単に構築が出来て、
技術的な不安定を持っているユーザを取り込んでいくのだろう。面白いネタも貰えた。
将来、Swift 代替で Gluster-FS が扱えるようになる可能性があるそうだ。また KVM 
にコミットしているエンジニアを抱えている彼らだが、KVM から直接 Gluster-FS 上の
VM イメージを操作出来るように修正加える案も出ているそうだ。これが実現すれば、
nova ノードのサーバリソースに依存しない大きな Disk イメージを扱うことも可能に
なるだろう。

また、Canonical JuJu, Opscode Chef に並ぶツールの紹介もあった。CloudForms がそ
れなのだが、各社と共通するコンセプトを持っているようだ。開発環境・本番環境への
シームレスなデプロイ、と。

DELL Crowbar
----

    DELL 増月さま

ある意味、僕にとって一番の収穫だったのが DELL の Crowbar。DELL サーバに依存せ
ず使えるデプロイツールで、IPMI, RAID, BIOS 等のハードウェア構成も自動構築が出
来るそう！また Opscode Chef がベースになっていて barclamp と呼ばれる Chef で
言う Cookbooks を元にソフトウェアをデプロイしていくそうだ。Chef Server 環境が
必須で chef-solo のような操作には対応していなそうなのが残念だった。Web ベース
の GUI インターフェースで操作するらしい。デモも当日見れました。

ハードウェア構成も自動構築出来るツールは Canonical の MAAS があるが、一歩踏み
込んだ構成が組めそう。尚、Opscode の Cookbooks を再利用するのは少し難しい状況
のようだ。この辺りは 2.0 バージョンで改善されるそうだ。Chef との依存関係をより
シンプルなものにするそう。

他ベンダのと差別化を図るのかと思いきや、サーバ機器に依存しないツールを出してく
る DELL さんの思いは、どこにあるのだろう。あと BIOS, RAID 周りをソフトウェアで
プロビジョニングしていく受け口の I/F は IPMI なのかな？質問すればよかった。

GMO お名前 KVM
----

先月の OSC で発表になった資料をベースに説明して頂いた。diablo ベースで CentOS
上に構築されているらしい。また griddynamic.net のパッケージ (知らなかった) を
利用して (なぜ素直に Ubuntu 使わないのかな？) 構築したそうだ。griddynamic.net
のパッケージは既にエキスパイアしているらしい...。nova ノードは既に200台規模。
libvirt, kvm 周りにパッチを独自で当てているそうで、その具体的内容が聞けた。た
だこの辺は OpenStack のアップデートに追いつく作業がめちゃ大変になるだろうなぁ
と想像する。..

全体を通して
----

Opscode Chef に並ぶ技術が出始めてきた。OpenStack で nodes を追加するところまで
自動化したとしても vm 上の操作を手作業するわけにはいかないし、必然なのだろう。
よりディストリビューションに依存しない、インフラ系・アプリ系共に理解出来る、自
由度のある、汎用性のある技術を我々が選びながら使っていく必要がありそう。僕らイ
ンフラ系エンジニアの仕事内容も、この辺りにシフトしていく時代はもう目の前まで来
ているだろう。OpenStack を構築する手順が JuJu 等でコマンド一発なのを見て唖然と
したのも確か。誰でもできる操作になるのも必然で、ただどういう操作がされているか
を理解し、必要に応じて改変して開発していく力は身に着けておかないと、インフラ系
は特に、仕事内容が単純化していく一方になる気がする。危機を感じつつチャンスに結
びつけるいい機会なのかなぁ。あとは監視周りも自動コンフィギュレーションされない
と、真の自動化には至らないなぁ。

当日は BitIsle スタッフのみなさん、コミュニティのみなさん、ありがとうございま
したぁー。