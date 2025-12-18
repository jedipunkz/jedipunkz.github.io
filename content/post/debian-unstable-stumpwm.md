+++
title = "Debian Unstable で stumpwm"
date = "2013-08-09"
Categories = ["infrastructure"]
description = "Debian Unstable でのタイル型ウィンドウマネージャ stumpwm のビルドとセットアップ手順"
aliases = [
  "/blog/2013/08/09/debian-unstable-stumpwm",
  "/post/2013/08/09/debian-unstable-stumpwm"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

Linux のウィンドウマネージャは使い続けて長いのですが、既に1周半しました。twm -> gnome ->
enlightenment -> OpenBox ->  .. 忘れた .. -> twm -> vtwm -> awesome -> kde ->
gnome -> enligtenment ...

巷では Linux のデスクトップ環境は死んだとか言われているらしいですが、stumpwm
というウィンドウマネージャは結構いいなと思いました。タイル型のウィンドウマネー
ジャで Emacs 好きの人が開発したらしいです。設定は lisp で書けます。

見た目は派手では無いのですが、

* グルーピング機能
* すべての操作がキーボードで出来る
* タイル型であるので煩わしいマウスでのウィンドウ操作が不要

という点に惹かれました。

Linux を使う時、私の場合 Debian Gnu/Linux Unstalble をいつも使うのですが、
Unstable だと apt-get install stumpwm したバイナリがコケる...ということでビル
ドしてあげました。普段慣れないビルド方法だったので、その時の手順を自分のために
もメモしておきます。

前提環境
----

* Debian Gnu/Linux unstable 利用
* X の環境は揃っている

ビルド手順
----

#### clisp をインストール

clisp をインストールします。

``` bash
% sudo apt-get install clisp-dev
```

lisp.run というファイルを stumpwm が見つけられないので symlink 張ってあげます。
ちょっと泥臭い。

``` bash
% sudo ln -s /usr/lib/clisp-2.49/base /usr/lib/clisp-2.49/full
```

#### sbcl をインストール

sbcl をインストールします。

``` bash
% sudo apt-get  install sbcl
```

#### quicklisp をインストール

quicklisp をインストールします。また lisp init file に諸々追加します。

``` bash
% wget http://beta.quicklisp.org/quicklisp.lisp
% sbcl --load quicklisp.lisp
* (quicklisp-quickstart:install)
* (ql:system-apropos "vecto")
* (ql:quickload "vecto")
* (ql:add-to-init-file)
* (ql:quickload "clx")
* (ql:quickload "cl-ppcre")
* quit
```

#### stumpwm のビルド

stumpwm をビルドします。

``` bash
% git clone https://github.com/sabetts/stumpwm.git
% cd stumpwm
% ./configure
% make
% sudo make install
```

まとめ
----

$HOME/.stumpwmrc を配置して、いろいろカスタマイズ出来ます。ウェブを検索すると
皆さんの rc ファイルが見つかるので参考にすると良いかも。prefix キーは C-t なの
ですが、tmux と被りますよね...。tmux 側は変えたくないので stumpwm 側を C-z 等
に変更して使っています。

```
(set-prefix-key (kbd "C-z"))
```

