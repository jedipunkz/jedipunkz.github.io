#!/bin/bash

if [ $# != 1 ]; then
    echo 'input commit message'
    exit
fi

hugo -t PaperMod

git add .
git commit -m "$1"
git push origin source
git subtree push --prefix=public origin master