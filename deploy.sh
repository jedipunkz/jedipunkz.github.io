#!/bin/bash

hugo -t hugo-future-imperfect

git add .

if [ $# -eq 1 ]; then
    msg="$1"
fi
git commit -m "$msg"

git push origin source
git subtree push --prefix=public origin master
