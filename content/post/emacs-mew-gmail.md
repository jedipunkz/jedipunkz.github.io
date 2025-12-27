+++
title = "Emacs + Mew で Gmail を読み書きする"
date = "2013-08-12"
Categories = ["tools"]
description = "Emacs と Mew、stunnel4 を使った Gmail の読み書き設定手順"
aliases = [
  "/blog/2013/08/12/emacs-mew-gmail",
  "/post/2013/08/12/emacs-mew-gmail"
]
+++
こんにちは。<a href="https://twitter.com/jedipunkz">@jedipunkz</a> です。

今日も軽めの話題を。

Gmail を Emacs + Mew で読み書きする方法を何故かいつも忘れてしまうので自分のた
めにもメモしておきます。Gmail はブラウザで読み書き出来るのに！と思われるかもし
れませんが、Emacs で文章が書けるのは重要なことです。:D
 
対象 OS
----

比較的新しい...

* Debian Gnu/Linux
* Ubuntu

を使います。

手順
----
 
Emacs, Mew, stunnel4 をインストールします。Emacs は好きな物を入れてください。
 
``` bash
% sudo apt-get install emacs24-nox stunnel4 mew mew-bin ca-certificates
```
 
openssl コマンドで mail.pem を生成します。生成したものを /etc/stunnel 配下に設
置します。
 
``` bash
% openssl req -new -out mail.pem -keyout mail.pem -nodes -x509 -days 365
% sudo cp mail.pem /etc/stunnel/
```
 
stunnel はインストール直後、起動してくれないので ENABLE=1 に修正します。
 
``` bash
% sudo ${EDITOR} /etc/default/stunnel4
ENABLE=1 # 0 -> 1 へ変更
```
 
stunenl.conf のサンプルを /etc/stunnel 配下に設置します。
 
``` bash
% sudo cp /usr/share/doc/stunnel4/examples/stunnel.conf-sample /etc/stunnel/stunnel.conf
```
 
$HOME/.mew.el ファイルを生成します。自分のアカウント情報などを入力します。
 
``` lisp
; Stunnel
(setq mew-prog-ssl "/usr/bin/stunnel4")
; IMAP for Gmail
(setq mew-proto "%")
(setq mew-imap-server "imap.gmail.com")
(setq mew-imap-user "example@gmail.com")
(setq mew-imap-auth  t)
(setq mew-imap-ssl t)
(setq mew-imap-ssl-port "993")
(setq mew-smtp-auth t)
(setq mew-smtp-ssl t)
(setq mew-smtp-ssl-port "465")
(setq mew-smtp-user "example@gmail.com")
(setq mew-smtp-server "smtp.gmail.com")
(setq mew-fcc "%Sent") ; 送信メイルを保存する
(setq mew-imap-trash-folder "%[Gmail]/ゴミ箱")
(setq mew-use-cached-passwd t)
(setq mew-ssl-verify-level 0)
```
 
$HOME/.emacs.d/init.el に Mew の記述を追記します。
 
``` lisp
(autoload 'mew "mew" nil t)
(autoload 'mew-send "mew" nil t)
(setq mew-fcc "+outbox") ; 送信メールを保存
(setq exec-path (cons "/usr/bin" exec-path))
```
 
 
Emacs + Mew を起動します。
 
``` bash
% emacs -e mew
```

まとめ
----

以上です。他の distro だと ca-certificate とか無いので、大変だなぁといつも思っ
てしまいます。
