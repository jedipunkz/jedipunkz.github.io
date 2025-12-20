---
title: "Terraform Plan 差分をパースする GitHub Actions を作った"
description: "Terraform Plan の差分を自動的にパースして処理する GitHub Actions の作成。特定のリソースを無視する機能など、Plan 結果を柔軟に扱う方法を紹介"
date: 2025-09-15T10:00:00+09:00
Categories: ["infrastructure", "terraform", "github-actions"]
draft: false
---
こんにちは。[jedipunkz🚀](https://x.com/jedipunkz) です。

Terraform を運用しているとたまに Plan 結果がどうしても出てしまう事があります。また Terraform を GitHub で実行する環境を運用していると Plan 結果をうまく扱って自動化したいモチベーションも湧いてきます。この場合に Plan の差分をうまく処理してくれる GitHub Action があればなと思って作ってみました。

## GitHub Actions

作成した GitHub Action は下記のレポジトリで公開しています。

https://github.com/jedipunkz/tf-plan-parser


## 入力・オプション設定

この GitHub Action では2つの入力オプションが利用可能です：

### terraform-plan (必須)
パース対象となる Terraform Plan の出力結果を指定します。通常は前のステップで実行した `terraform plan` コマンドの標準出力を渡します。

### ignore-resources (オプション)
無視したいリソースタイプや特定のリソースを配列形式で指定します。デフォルトは空の配列 `[]` です。

指定方法の例：

**リソースタイプ全体を無視:**
```yaml
ignore-resources: '["null_resource", "local_file"]'
```

**特定のリソースインスタンスを無視:**
```yaml
ignore-resources: '["null_resource.temporary", "local_file.cache"]'
```

**リソースタイプとインスタンスの混在:**
```yaml
ignore-resources: '["null_resource", "aws_s3_bucket.temp", "local_file"]'
```

## 出力される情報

この Action は以下の出力を提供します。また下記は ignore-resources オプションの指定に沿って結果を出力してくれます。

- diff-bool: 変更があるかどうかの真偽値（`true` または `false`）
- diff-count: 変更されるリソースの数
- diff-resources: 変更されるリソースのアドレス一覧（カンマ区切り）
- diff-raw: 生の差分データ
- diff-json: s分データの JSON 形式

これらの出力を使って、後続のステップで条件分岐や通知の制御が可能です。

### diff-json の構造

diff-json は下記の JSON 構造を持っています。

```json
{
  "hasDiffs": true,
  "summary": {
    "totalChanges": 3,
    "toAdd": 3,
    "toChange": 1,
    "toDestroy": 0
  },
  "resources": [
    {
      "address": "aws_instance.web",
      "resourceType": "aws_instance",
      "action": "create",
      "changes": {
        "before": null,
        "after": "Value will be known after apply",
        "description": "Resource will be created"
      }
    },
    {
      "address": "aws_s3_bucket.assets",
      "resourceType": "aws_s3_bucket",
      "action": "update",
      "changes": {
        "before": "Value will be known after apply",
        "after": "Value will be known after apply",
        "description": "Resource will be updated in-place"
      }
    }
  ],
  "resourceCount": 2,
  "timestamp": "2025-09-15T07:48:22.123Z"
}
```

## 資料例の紹介

ここからは使用例を幾つか紹介します。

### 基本的な使い方

```yaml
- name: Terraform Plan
  id: plan
  run: terraform plan -no-color

- name: Parse Plan
  id: parse
  uses: jedipunkz/tf-plan-parser@v1
  with:
    terraform-plan: ${{ steps.plan.outputs.stdout }}
    ignore-resources: '["null_resource", "random_id"]'

- name: Check results
  run: |
    echo "Changes detected: ${{ steps.parse.outputs.diff-bool }}"
    echo "Resource count: ${{ steps.parse.outputs.diff-count }}"
```

### jq を使った diff-json の活用例

```yaml
    - name: Extract total changes
      run: |
        DIFF_JSON='${{ steps.parse.outputs.diff-json }}'
        if [ -n "$DIFF_JSON" ] && [ "$DIFF_JSON" != "null" ]; then
          TOTAL_CHANGES=$(echo "$DIFF_JSON" | jq -r '.summary.totalChanges // 0')
        else
          TOTAL_CHANGES=0
        fi
        echo "Total changes: $TOTAL_CHANGES"
```

### Pull Request への自動コメント

```yaml
- name: Terraform Plan
  id: plan
  run: terraform plan -out=tfplan -no-color

- name: Parse Plan
  id: parse
  uses: jedipunkz/tf-plan-parser@v1
  with:
    terraform-plan: ${{ steps.plan.outputs.stdout }}
    ignore-resources: '["null_resource", "local_file"]'

- name: Comment on PR
  uses: actions/github-script@v7
  with:
    script: |
      const diffBool = '${{ steps.parse.outputs.diff-bool }}';
      const diffCount = '${{ steps.parse.outputs.diff-count }}';
      const resources = JSON.parse('${{ steps.parse.outputs.diff-resources }}');
      const diffRaw = `${{ steps.parse.outputs.diff-raw }}`;

      let body = '## Terraform Plan Parser\n\n';

      // Summary
      if (diffBool === 'true') {
        body += `✅ **Changes detected** affecting ${diffCount} resources:\n\n`;
        body += '### Changed Resources\n```\n';
        for (const resource of resources) {
          body += `${resource}\n`;
        }
        body += '```\n\n';
      } else {
        body += '✅ **No changes detected**\n\n';
      }

      // All outputs
      body += '### Outputs\n';
      body += `- **diff-bool**: \`${diffBool}\`\n`;
      body += `- **diff-count**: \`${diffCount}\`\n`;
      body += `- **diff-resources**: \`${JSON.stringify(resources)}\`\n\n`;

      // Raw plan
      if (diffRaw && diffRaw.trim()) {
        body += '### Raw Terraform Plan Output\n';
        body += '```\n' + diffRaw + '\n```\n\n';
      }

      body += '---\n*Generated by Terraform Plan Parser*';

      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: body
      })
```

### 条件分岐でのデプロイ制御

```yaml
- name: Terraform Plan
  id: plan
  run: terraform plan -out=tfplan -no-color

- name: Parse Plan
  id: parse
  uses: jedipunkz/tf-plan-parser@v1
  with:
    terraform-plan: ${{ steps.plan.outputs.stdout }}
    ignore-resources: '["null_resource", "random_id", "local_file"]'

- name: Skip deployment if no changes
  if: steps.parseoutputs.diff-bool == 'false'
  run: echo "No infrastructure changes detected. Skipping deployment."

- name: Proceed with deployment
  if: steps.parseoutputs.diff-bool == 'true'
  run: |
    echo "Infrastructure changes detected: ${{ steps.parseoutputs.diff-count }} resources"
    terraform apply -auto-approve tfplan

- name: Notify on major changes
  if: steps.parseoutputs.diff-count > 10
  run: |
    echo "⚠️ Large number of changes detected (${{ steps.parseoutputs.diff-count }} resources)"
    echo "Manual review recommended"
```

### diff-json を使った高度な利用例

```yaml
- name: Terraform Plan
  id: plan
  run: terraform plan -out=tfplan -no-color

- name: Parse Plan
  id: parse
  uses: jedipunkz/tf-plan-parser@v1
  with:
    terraform-plan: ${{ steps.plan.outputs.stdout }}
    ignore-resources: '["null_resource", "local_file"]'

    - name: Extract values with jq
      id: extract-jq
      run: |
        DIFF_JSON='${{ steps.parse.outputs.diff-json }}'
        TOTAL_CHANGES=$(echo "$DIFF_JSON" | jq -r '.summary.totalChanges')
        TO_ADD=$(echo "$DIFF_JSON" | jq -r '.summary.toAdd')
        TO_CHANGE=$(echo "$DIFF_JSON" | jq -r '.summary.toChange')
        TO_DESTROY=$(echo "$DIFF_JSON" | jq -r '.summary.toDestroy')
        RESOURCE_COUNT=$(echo "$DIFF_JSON" | jq -r '.resourceCount')

        echo "total-changes=$TOTAL_CHANGES" >> $GITHUB_OUTPUT
        echo "to-add=$TO_ADD" >> $GITHUB_OUTPUT
        echo "to-change=$TO_CHANGE" >> $GITHUB_OUTPUT
        echo "to-destroy=$TO_DESTROY" >> $GITHUB_OUTPUT
        echo "resource-count=$RESOURCE_COUNT" >> $GITHUB_OUTPUT

    - name: Comment on PR
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v7
      env:
        DIFF_JSON: ${{ steps.parse.outputs.diff-json }}
      with:
        script: |
          const diffBool = '${{ steps.parse.outputs.diff-bool }}';
          const diffCount = '${{ steps.parse.outputs.diff-count }}';
          const resources = JSON.parse('${{ steps.parse.outputs.diff-resources }}');
          const totalChanges = '${{ steps.extract-jq.outputs.total-changes }}';
          const toAdd = '${{ steps.extract-jq.outputs.to-add }}';
          const toChange = '${{ steps.extract-jq.outputs.to-change }}';
          const toDestroy = '${{ steps.extract-jq.outputs.to-destroy }}';

          let diffJson;
          try {
            diffJson = JSON.parse(process.env.DIFF_JSON);
          } catch (e) {
            console.log('Failed to parse diff-json:', e);
            diffJson = { resources: [] };
          }

          let body = `## Terraform Plan Analysis (${totalChanges} total changes via jq)\n\n`;

          if (diffBool === 'true') {
            body += `✅ **Changes detected** affecting ${diffCount} resources:\n\n`;

            // Original Changed Resources section
            body += '### Changed Resources\n```\n';
            for (const resource of resources) {
              body += `${resource}\n`;
            }
            body += '```\n\n';

            // Plan Summary
            body += `**Plan Summary**: ${toAdd} to add, ${toChange} to change, ${toDestroy} to destroy\n\n`;

            // Detailed resource changes from diff-json
            body += '### Detailed Resource Changes\n';
            for (const resource of diffJson.resources) {
              const actionEmoji = {
                'create': '➕',
                'update': '🔄',
                'delete': '❌',
                'replace': '🔄'
              }[resource.action] || '🔄';

              body += `${actionEmoji} **${resource.action.toUpperCase()}**: \`${resource.address}\` (${resource.resourceType})\n`;
              body += `   - ${resource.changes.description}\n\n`;
            }
          } else {
            body += '✅ **No changes detected**\n\n';
          }

          body += '---\n*Generated by Terraform Plan Parser*';

          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: body
          });
```

## まとめ・今後の機能追加について

今回作成したツールにより、Terraform Plan の差分解析が効率化されるかもしれないと思っています。特に下記の点で効果を期待しています。

- 意図しない差分と重要な差分の区別が指定出来るようになった
- Plan 結果差分に反応して通知する仕組み等に応用が効く
- チーム全体で差分の判断基準を統一指定出来る
- json 構造を使って柔軟に差分情報を活用出来る

また、今後の機能追加として以下を検討しています：

- 差分の変更の種類（create/update/delete）ごとの分類
- 入力・出力の拡張

ぜひ皆さんの Terraform 運用でも活用してみてください！
