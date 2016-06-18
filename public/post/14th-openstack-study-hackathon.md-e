+++
title = "第14回 OpenStack 勉強会参加ログ"
date = "2013-09-09"
slug = "2013/09/09/14th-openstack-study-hackathon"
Categories = ["infrastructure", "report"]
+++
こんにちは。@jedipunkz です。

OpenStack 第14回勉強会 ハッカソンに参加してきました。その時の自分の作業ログを
記しておきます。自分の作業内容は 'OpenStack + Docker 構築' です。

    場所 : CreationLine さま
    日時 : 2013年9月8日(土)

当日の atnd。

<http://atnd.org/events/42891>

当日発表のあった内容

* Ansible で OpenStack を実際に皆の前でデプロイ！
* Yoshiyama さん開発 LogCas お披露目
* Havana の機能改善・機能追加内容確認
* その他 Horizon の機能についてだったり openstack.jp の運用についてなど

自分が話を聞きながら黙々とやったことは

* OpenStack + Docker 構築

結果... NG 動かず。時間切れ。公式の wiki の手順がだいぶ変なので手順を修正しながら進めました。

公式の wiki はこちらにあります。

<https://wiki.openstack.org/wiki/Docker>

その修正しながらメモった手順を下記に貼り付けておきます。

作業環境
----

* ホスト : Ubuntu 12.04.3 Precise
* OpenStack バージョン : devstack (2013/09/08 master ブランチ)
* 構成 : オールインワン (with heat, ceilometer, neutron)

普通に動かすとエラーが出力される
----

これは devstack (2013/09/08 時点) での不具合なので直ちに修正されるかも。

デフォルトのエンコーディングが 'ascii' になっているのが原因らしい.

``` python
% python
Python 2.7.3 (default, Apr 10 2013, 06:20:15)
[GCC 4.6.3] on linux2
Type "help", "copyright", "credits" or "license" for more information.
>>> import sys
>>> sys.getdefaultencoding()
'ascii'
>>>
```

エラーの内容は…
----

この状態だと… 下記のようなエラーが nova から出力される。むむむ。

``` bash
% nova boot --image "ubuntu:latest" --flavor 1 vm01
ERROR: UnicodeError: 'ascii' codec can't decode byte 0xe5 in position 2: ordinal not in range(128) (HTTP 400) (Request-ID: req-40ebfb9b-d76a-40b8-8f75-facb4dd73db4)
```

とりあえず暫定処置として、下記のように setdefaultencoding('utf-8') を追記。ち
なみに devstack デプロイ前にこの作業を済ませました。デプロイ後だと色々めんどい。
当日、何度もめんどい場面に遭遇しました...

``` bash
% ${EDITOR} /usr/lib/python2.7/sitecustomize.py
# install the apport exception handler if available
try:
    import apport_python_hook
except ImportError:
    pass
else:
    apport_python_hook.install()

# 下記の2行を追記
import sys
sys.setdefaultencoding('utf-8')
```

Ubuntu12.04 の場合 Linux Kernel 3.8 にアップデート
----

wiki には載っていないが docker が Linux Kernel 3.8 以上を推奨しているため
raring から 3.8 を持ってくる。

``` bash
% sudo apt-get update
% sudo apt-get install linux-image-generic-lts-raring linux-headers-generic-lts-raring
% sudo reboot
```

socat インストール
----

後に実行する install_docker.sh スクリプトが必要とする。実行前に入れないとと痛
い目見る。当日何度も痛い目見ました...

``` bash
% sudo apt-get install socat
```

localrc 追記
----

localrc に下記を追記。その他のパラメータは各自のモノで良い。

```
VIRT_DRIVER=docker
```

install_docker.sh 実行  
----

一般ユーザ権限で OK 。中で sudo している。が、極稀に sudo のタイムアウトが来る
ので、色々しんどい。ちなみに僕はここで何度もやりなおしました。...

``` bash
% ./tools/docker/install_docker.sh
```

devstack インストール
----

devstack をデプロイする。

``` bash
% ./stack.sh
```


index.docker.io から 'ubuntu' イメージをダウンロード
----

index.docker.io のトップレベルから 'ubuntu' イメージを取得。どのイメージでも良い。

``` bash
% sudo docker pull ubuntu
Pulling repository ubuntu
8dbd9e392a96: Download complete
b750fe79269d: Download complete
27cf78414709: Download complete
````

docker-registry (プライベートレポジトリ) に対して push する -> Glance に登録
----

この状態で docker-registry.sh というプロセスが起動しているはず。これは docker   
のプライベートレポジトリに相当。5042 tcp で待ち受けているので下記のように tag を打った後、プライベートレポジトリに
アップロード。

``` bash
% sudo docker tag ubuntu 10.200.9.25:5042/ubuntu
% sudo docker push 10.200.9.25:5042/ubuntu
The push refers to a repository [10.200.9.25:5042/ubuntu] (len: 1)
Sending image list
Pushing repository 10.200.9.25:5042/ubuntu (1 tags)
Pushing 8dbd9e392a964056420e5d58ca5cc376ef18e2de93b5cc90e868a1bbc8318c1c
Pushing tags for rev [8dbd9e392a964056420e5d58ca5cc376ef18e2de93b5cc90e868a1bbc8318c1c] on {http://10.200.9.25:5042/v1/repositories/ubuntu/tags/latest}
```

docker のレポジトリについてはここが参考になる。

<http://docs.docker.io/en/latest/use/workingwithrepository/>

glance に登録されていることを確認  
----

'ubuntu:latest' が表示されるはず。やった。

``` bash
% glance image-list
+--------------------------------------+---------------------------------+-------------+------------------+----------+--------+
| ID								   | Name							| Disk Format | Container Format | Size	 | Status |
+--------------------------------------+---------------------------------+-------------+------------------+----------+--------+
| f5845be4-1ac0-42c7-9280-a8c316be6beb | cirros-0.3.1-x86_64-uec		 | ami		 | ami			  | 25165824 | active |
| aa8bcdff-6eb9-402b-9e27-675648dbe311 | cirros-0.3.1-x86_64-uec-kernel  | aki		 | aki			  | 4955792  | active |
| f8857736-5613-401a-b28c-02c286271af4 | cirros-0.3.1-x86_64-uec-ramdisk | ari		 | ari			  | 3714968  | active |
| ae56cacb-7eb6-413e-bd75-46f3cd63123b | docker-busybox:latest		   | raw		 | docker		   | 2271796  | active |
| 613b05c3-30f6-4c53-aa94-103ea516373e | ubuntu:latest				   | raw		 | docker		   | 71497587 | active |
+--------------------------------------+---------------------------------+-------------+------------------+----------+--------+
```


nova boot
----

ぐったり... nova-scheduler がエラー吐いてるぽいけど、原因つかめず。ハッカソン時間切れ。

``` bash
% nova boot --image "ubuntu:latest" --flavor m1.tiny vm01
% nova list
+--------------------------------------+------+--------+------------+-------------+----------+
| ID                                   | Name | Status | Task State | Power State | Networks |
+--------------------------------------+------+--------+------------+-------------+----------+
| e1563b55-bb5d-43a6-a1fc-c3bc63600ac7 | vm01 | ERROR  | None       | NOSTATE     |          |
+--------------------------------------+------+--------+------------+-------------+----------+
```

エラー内容..
----

下記のエラーが出力されていた。なんだか OpenStack のメッセージじゃないような。
調べてたら素の Python のメッセージらしく。うーん。devstack なので仕方ない。

```
    Sep  7 14:53:08 devstack01 2013-09-07 14:53:08.490 ERROR nova.compute.manager [req-d4ff6a45-88bc-4d6e-8f9d-43de79e601c6 demo demo] [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09] Instance failed to spawn#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09] Traceback (most recent call last):#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]   File "/opt/stack/nova/nova/compute/manager.py", line 1416, in _spawn#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]     block_device_info)#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]   File "/opt/stack/nova/nova/virt/docker/driver.py", line 305, in spawn#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]     raise exception.InstanceDeployFailure(msg.format(e),#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]   File "/opt/stack/nova/nova/openstack/common/gettextutils.py", line 255, in __getattribute__#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]     return UserString.UserString.__getattribute__(self, name)#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09] AttributeError: 'Message' object has no attribute 'format'#0122013-09-07 14:53:08.490 31835 TRACE nova.compute.manager [instance: fdd0fdfb-aaa2-4e91-98cc-cdb347e9ae09]
```

所感とまとめ
----

前半の1,2時間、みなさんの話に聞き入ってしまったので時間が…。発表の内容も皆さ
んの会話も楽しかった。また参加したい。Netron 周りで聞きたい事とか色々あったの
だけどコアデベロッパの方に聞けなかったのが後悔。今度教えてもらおう。あとやっぱ
りみなさん詳しい。その情報どこから？ということまでよく知っているし知識が深い。
理解度がまだまだちゃうなぁと実感。次回も参加させていただこうと思います。

