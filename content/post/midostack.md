+++
title = "MidoStack を動かしてみる"
date = "2014-11-04"
slug = "2014/11/04/midostack"
Categories = ["infrastructure"]
description = "OSS 化された Midonet と devstack を使った OpenStack Neutron プラグインの動作確認"
+++
こんにちは。@jedipunkz です。

昨晩 Midokura さんが Midonet を OSS 化したとニュースになりました。公式サイトは
下記の URL になっています。Midonet は OpenStack Neutron のプラグインとして動作
するソフトウェアです。

http://www.midonet.org

下記のGithub 上でソースを公開しています。

https://github.com/midonet

本体の midonet と共に midostack というレポジトリがあってどうやら公式サイトの
QuickStart を見ても devstack を交えての簡単な midonet の動作が確認できそう。

https://github.com/midonet/midostack

早速使ってみる
----

早速 midostack を使って midonet を体験してみましょう。QuickStart には
Vagrant + VirtualBox を用いた使い方が改定ありますが手元の PC 端末だとリソース
が足らなくて CirrOS VM 一個すら立ち上がりませんでした。よって普通にリソースの
沢山あるサーバで稼働してみます。Vagrantfile 見ても

```
config.vm.synced_folder "./", "/midostack"
```

としているだけなので、Vagrant ではなくても大丈夫でしょう。

Ubuntu Server 14.04 をインストールしたマシンを用意して midostack を取得します。

```bash
% git clone https://github.com/midonet/midostack.git
```

midonet_stack.sh を実行します。

```bash
% cd midostack
% ./midonet_stack.sh
```

暫く待つと Neutron Middonet Plugin が有効になった OpenStack が立ち上がります。
Horizon にアクセスしましょう。ユーザ名 : admin, パスワード : gogomid0 (デフォ
ルト) です。

VM も普通に立ち上がりますし VM 同士の通信も良好です。

Neutron プロセスを確認する
----

Neutron-Server は下記のように立ち上がっています。

```bash
16229 pts/13   S+     0:06 python /usr/local/bin/neutron-server --config-file /etc/neutron/neutron.conf --config-file /etc/neutron/plugins/midonet/midonet.ini
```

/etc/neutron/neutron.conf の midonet の指定はこんな感じ。

```
core_plugin = midonet.neutron.plugin.MidonetPluginV2
api_extensions_path = /opt/stack/midonet/python-neutron-plugin-midonet/midonet/neutron/extensions
```

次に /etc/neutron/plugins/midonet/midonet.ini を確認してみましょう。


```
[midonet]
# MidoNet API server URI
# midonet_uri = http://localhost:8080/midonet-api

# MidoNet admin username
# username = admin

# MidoNet admin password
# password = passw0rd

# ID of the project that MidoNet admin user belongs to
# project_id = 77777777-7777-7777-7777-777777777777

# Virtual provider router ID
# provider_router_id = 00112233-0011-0011-0011-001122334455

# Path to midonet host uuid file
# midonet_host_uuid_path = /etc/midolman/host_uuid.properties

[MIDONET]
project_id = admin
password = gogomid0
username = admin
midonet_uri = http://localhost:8081/midonet-api
```

Midonet API にアクセスする
----

Midonet API のリファレンスが下記の URL で公開されていました。

http://docs.midonet.org/docs/v1.8/rest-api/api/rest-api-specification.html

早速使ってみましょう。まず Token を得ます。

```bash
curl -i 'http://127.0.0.1:5000/v2.0/tokens' -X POST -H "Content-Type: application/json" -H "Accept: application/json"  -d '{"auth": {"tenantName": "admin", "passwordCredentials": {"username": "admin", "password": "gogomid0"}}}'
```
Token ID を取得したら "/" に対してアクセスしてみましょう。

```bash
% curl -i -X GET http://localhost:8081/midonet-api/ -H "User-Agent: python-keystoneclient" -H "X-Auth-Token: <TokenID>"
```

レスポンス

```json
{
"routerTemplate": "http://localhost:8081/midonet-api/routers/{id}",
"portTemplate": "http://localhost:8081/midonet-api/ports/{id}",
"vipTemplate": "http://localhost:8081/midonet-api/vips/{id}",
"poolTemplate": "http://localhost:8081/midonet-api/pools/{id}",
"healthMonitorTemplate": "http://localhost:8081/midonet-api/health_monitors/{id}",
"healthMonitors": "http://localhost:8081/midonet-api/health_monitors",
"loadBalancers": "http://localhost:8081/midonet-api/load_balancers",
"ipAddrGroupTemplate": "http://localhost:8081/midonet-api/ip_addr_groups/{id}",
"tenants": "http://localhost:8081/midonet-api/tenants",
"tenantTemplate": "http://localhost:8081/midonet-api/tenants/{id}",
"portGroupTemplate": "http://localhost:8081/midonet-api/port_groups/{id}",
"loadBalancerTemplate": "http://localhost:8081/midonet-api/load_balancers/{id}",
"poolMemberTemplate": "http://localhost:8081/midonet-api/pool_members/{id}",
"hostVersions": "http://localhost:8081/midonet-api/versions",
"version": "v1.7",
"bridgeTemplate": "http://localhost:8081/midonet-api/bridges/{id}",
"hostTemplate": "http://localhost:8081/midonet-api/hosts/{id}",
"uri": "http://localhost:8081/midonet-api/",
"vteps": "http://localhost:8081/midonet-api/vteps",
"tunnelZoneTemplate": "http://localhost:8081/midonet-api/tunnel_zones/{id}",
"ipAddrGroups": "http://localhost:8081/midonet-api/ip_addr_groups",
"writeVersion": "http://localhost:8081/midonet-api/write_version",
"chainTemplate": "http://localhost:8081/midonet-api/chains/{id}",
"vtepTemplate": "http://localhost:8081/midonet-api/vteps/{ipAddr}",
"adRouteTemplate": "http://localhost:8081/midonet-api/ad_routes/{id}",
"bgpTemplate": "http://localhost:8081/midonet-api/bgps/{id}",
"hosts": "http://localhost:8081/midonet-api/hosts",
"routeTemplate": "http://localhost:8081/midonet-api/routes/{id}",
"ruleTemplate": "http://localhost:8081/midonet-api/rules/{id}",
"systemState": "http://localhost:8081/midonet-api/system_state",
"vips": "http://localhost:8081/midonet-api/vips",
"pools": "http://localhost:8081/midonet-api/pools",
"routers": "http://localhost:8081/midonet-api/routers",
"bridges": "http://localhost:8081/midonet-api/bridges",
"chains": "http://localhost:8081/midonet-api/chains",
"portGroups": "http://localhost:8081/midonet-api/port_groups",
"poolMembers": "http://localhost:8081/midonet-api/pool_members",
"tunnelZones": "http://localhost:8081/midonet-api/tunnel_zones"
}
```

なんとなく引数にこれらの文字列を渡せばいいのだなと分かります。

次に neutron の管理している subnets を確認してみましょう。

```bash
% curl -i -X GET http://localhost:8081/midonet-api/neutron/subnets -H "User-Agent: python-keystoneclient" -H "X-Auth-Token: <TokenID>"
```

レスポンス

```json
[
  {
    "enable_dhcp": false,
    "tenant_id": "65f7012145d84ac5afc36572eabe5b09",
    "host_routes": [],
    "dns_nameservers": [],
    "id": "3dbe5cff-8a8c-4790-85b5-b789d8ede863",
    "name": "public-subnet",
    "cidr": "200.200.200.0/24",
    "shared": false,
    "ip_version": 4,
    "network_id": "45269fba-e32f-40b0-a542-f5cfe34ce1a1",
    "gateway_ip": "200.200.200.1",
    "allocation_pools": [
      {
        "last_ip": null,
        "first_ip": null
      }
    ]
  },
  {
    "enable_dhcp": true,
    "tenant_id": "f34b4398015546b8b84f50c731ed6c51",
    "host_routes": [],
    "dns_nameservers": [],
    "id": "3dbcf04a-9738-4b1f-b084-76f2a4b17cbc",
    "name": "private-subnet",
    "cidr": "10.0.0.0/24",
    "shared": false,
    "ip_version": 4,
    "network_id": "2edb78c3-0f23-4e29-a3e6-cc97f55baa6a",
    "gateway_ip": "10.0.0.1",
    "allocation_pools": [
      {
        "last_ip": null,
        "first_ip": null
      }
    ]
  }
]
```

２つのサブネットが確認出来ました。


まとめ
----

勉強不足でまだ全く midonet で出来る事がわからない..汗。でもとりあえず動かせた
し、API も引っ張れるのでこれから色々試せそうですね。OSS 化されたことで、コミュ
ニティの間でも使われていくことも想像出来ますし、自分たち技術者としてはとても有
り難いことでした。
