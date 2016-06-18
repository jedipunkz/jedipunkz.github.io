+++
title = "Quantum Network ノードの分散・冗長"
date = "2013-04-26"
slug = "2013/04/26/quantum-network-distributing"
Categories = ["infrastructure"]
+++
こんにちは。Grizzly がリリースされてから暫く経ちました。今回は Folsom リリース
まであった Quantum ノードのボトルネックと単一障害点を解決する新しい機能につい
て評価した結果をお伝えします。

Folsom までは

* Quantum L3-agent が落ちると、その OpenStack 一式の上にある仮想マシン全ての通
  信が途絶える
* Quantum L3-agent に仮想マシンの全てのトラフィックが集まりボトルネックとなる。

という問題がありました。Folsom リリース時代にもし僕が職場で OpenStack を導入す
るのであればこれらを理由に nova-network を選択していたかもしれません。
nova-network は compute ノードが落ちればその上の仮想マシンも同時に落ちるが、他
の compute ノード上の仮想マシンの通信には影響を与えないからです。もちろん仮想
ルータ・仮想ネットワークの生成等を API でユーザに提供したいなどの要望があれば
Quantum を選択するしかありませんが。これに対して Grizzly リリースの Quantum は
改善に向けて大きな機能を提供してくれています。L3-agent, DHCP-agent の分散・冗
長機能です。

下記の構成が想定出来ます。ここでは Network ノードを2台用意しました。それ以上の
台数に増やすことも出来ます。

    +-------------+-------------+-------------------------- Public/API Network
    |             |             |
    +-----------+ +-----------+ +-----------+ +-----------+
    |           | |           | |           | |vm|vm|..   |
    | controller| |  network  | |  network  | +-----------+
    |           | |           | |           | |  compute  |
    +-----------+ +-----------+ +-----------+ +-----------+
    |             |     |       |     |       |     |
    +-------------+-----)-------+-----)-------+-----)------ Management/API Network
                        |             |             |
                        +-------------+-------------+------ Data Network

L3-agent の分散は仮想ルータ単位で行います。それに対し DHCP-agent は仮想
ネットワーク単位で行います。

agent 一覧の取得
----

上記の構成を構築すると下記のように agent 一覧が取得出来ます。

    % quantum agent-list # 'admin' ユーザでアクセス
    +--------------------------------------+--------------------+-----------------------+-------+----------------+
    | id                                   | agent_type         | host                  | alive | admin_state_up |
    +--------------------------------------+--------------------+-----------------------+-------+----------------+
    | 44795822-2d9f-434e-ba98-748f7411442f | DHCP agent         | grizzly03.example.com | :-)   | True           |
    | a5150a40-0405-4399-ac1a-be012f55d9f5 | DHCP agent         | grizzly02.example.com | :-)   | True           |
    | b7bf4e59-06ac-475c-84ab-413d8d29f293 | Open vSwitch agent | grizzly04.example.com | :-)   | True           |
    | cc5a6b94-6ddd-4109-8f2f-1b28c6aaf5e6 | L3 agent           | grizzly03.example.com | :-)   | True           |
    | d39803cf-19d3-47d7-8205-cf9a143dd0ea | Open vSwitch agent | grizzly02.example.com | :-)   | True           |
    | d8e59803-9aad-4c62-a47a-519bc788e0fb | Open vSwitch agent | grizzly03.example.com | :-)   | True           |
    | f6f747cf-ffb0-446c-a455-2947fd3e87e8 | L3 agent           | grizzly02.example.com | :-)   | True           |
    +--------------------------------------+--------------------+-----------------------+-------+----------------+

ホスト名は下記。

* controller : grizzly01.exmaple.com
* network01  : grizzly02.exmaple.com
* network02  : grizzly03.exmaple.com
* compute    : grizzly04.exmaple.com

L3-agent の分散方法 (ノード移動)
----

仮想ルータ (ここでは 'router-test01' とする) がどの L3-agent に属しているか確
認を取る。

    % quantum l3-agent-list-hosting-router router-demo
    +--------------------------------------+-----------------------+----------------+-------+
    | id                                   | host                  | admin_state_up | alive |
    +--------------------------------------+-----------------------+----------------+-------+
    | f6f747cf-ffb0-446c-a455-2947fd3e87e8 | grizzly02.example.com | True           | :-)   |
    +--------------------------------------+-----------------------+----------------+-------+

1台目の Network ノード (grizzly02.example.com) 上の L3-agent に属していること
が確認取れた。次にこの親子関係を削除する。

    % quantum l3-agent-router-remove f6f747cf-ffb0-446c-a455-2947fd3e87e8 router-test01
    Removed Router router-demo to L3 agent

最後に仮想ルータ 'router-test01' を2台目の Network ノード上の L3-agent の管理
下に設定する。

    % quantum l3-agent-router-add cc5a6b94-6ddd-4109-8f2f-1b28c6aaf5e6 router-demo
    Added router router-demo to L3 agent
    % quantum l3-agent-list-hosting-router router-demo
    +--------------------------------------+-----------------------+----------------+-------+
    | id                                   | host                  | admin_state_up | alive |
    +--------------------------------------+-----------------------+----------------+-------+
    | cc5a6b94-6ddd-4109-8f2f-1b28c6aaf5e6 | grizzly0404.cpi.ad.jp | True           | xxx   |
    +--------------------------------------+-----------------------+----------------+-------+

DHCP-Agent の分散方法 (ノード移動)
----

仮想マシンが所属しているネットワーク (ここでは 'int_net') がどの DHCP-agent に所属しているか確認する。

    % quantum dhcp-agent-list-hosting-net int_net
    +--------------------------------------+-----------------------+----------------+-------+
    | id                                   | host                  | admin_state_up | alive |
    +--------------------------------------+-----------------------+----------------+-------+
    | a5150a40-0405-4399-ac1a-be012f55d9f5 | grizzly02.example.com | True           | :-)   |
    +--------------------------------------+-----------------------+----------------+-------+

1台目のノードに所属しているのが確認できる。次に 'int_net' が所属する DHCP-agent を削除行う。

    % quantum dhcp-agent-network-remove a5150a40-0405-4399-ac1a-be012f55d9f5 int_net
    Removed network int_net to DHCP agent

2台目のノードの DHCP-agent を仮想ネットワーク 'int_net' に紐付ける。

    % quantum dhcp-agent-network-add 44795822-2d9f-434e-ba98-748f7411442f int_net
    Added network int_net to DHCP agent
    % quantum dhcp-agent-list-hosting-net int_net
    +--------------------------------------+-----------------------+----------------+-------+
    | id                                   | host                  | admin_state_up | alive |
    +--------------------------------------+-----------------------+----------------+-------+
    | 44795822-2d9f-434e-ba98-748f7411442f | grizzly0404.cpi.ad.jp | True           | :-)   |
    +--------------------------------------+-----------------------+----------------+-------+

まとめ
----

この様に仮想ルータ, 仮想ネットワーク単位で Network ノードの agent の分散が行え
る。上記のように仮想ルータ・ネットワークが1つずつでは分散という意味では無いが
運用の過程で仮想ルータ・ネットワークは増えることが想定出来るのでその際にはトラ
フィック・DHCP 機能を分散することが可能になる、と言える。また片系の Network ノー
ドに寄せておいてからの障害テスト -> もう片系への移動も行なってみたが作業ととも
に仮想マシンの通信が復旧した。このテストを行う前まで 'agent の移動だけ行えるの
であって仮想ルータ自体が移動するわけではないので冗長という意味はない' と考えて
いたのだが、実際には上記の操作で namespace が移動していることが判り (Quantum
の仮想ルータの実体は Linux Namespace) 障害テストの結果、うまくいった。
OpenStack を導入するという意味で、この機能は非常に大きな前進だと僕は思っていま
す。


