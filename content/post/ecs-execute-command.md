---
title: "Go 言語と awscli を使って ECS/Fargate 上でコマンドを実行する2つの方法"
date: 2021-04-13T18:35:36+09:00
Categories: ["infrastructure"]
draft: false
---
こんにちは [@jedipunkz](https://twitter.com/jedipunkz) 🚀 です。

最近、職場では ECS/Fargate でサービスを運用しています。そこで ECS Task 上でコマンドを実行する必要に迫られて幾つか調べたのですが、複数の方法があり検証をしてみました。これには 2021/03 にリリースされたばかりの ECS 上のコンテナでコマンドを実行する機能も含まれています。

自分たちは自動化する必要があったので Go 言語 (aws-sdk-go) を中心に検証実施しましたが同時に awscli でも動作検証しましたので、その方法をこの記事に記そうかと思います。

下記の2つの ECS の機能についてそれぞれ Go 言語, awscli で動作検証実施しました。

- [ECS Execute Command (New)](https://aws.amazon.com/jp/blogs/news/new-using-amazon-ecs-exec-access-your-containers-fargate-ec2/)
- [ECS Run Task](https://docs.aws.amazon.com/cli/latest/reference/ecs/run-task.html)

## 用いるツール類

下記のツールを前提に記事を記します。

- [aws-sdk-go](https://docs.aws.amazon.com/sdk-for-go/api/service/ecs/)
- [Terraform](https://www.terraform.io/)
- [awscli](https://aws.amazon.com/jp/cli/)

## 共通で必要な taskRoleArn

まず Task Definition に対して executeRoleArn とは別に TaskRoleArn の付与が必要になります。

```hcl
resource "aws_ecs_task_definition" "sample" {
  family                   = "sample"
  cpu                      = "256"
  memory                   = "512"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = module.ecs_task_execution_role.iam_role_arn
  task_role_arn            = module.ecs_task__role.iam_role_arn
  container_definitions    = data.template_file.container_definition_sample.rendered
}
```

taksRoleArn の内容については https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/task-iam-roles.html に情報があり、下記が必要になります。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

## コマンド実行
### ECS Exuecute Command (2021/03 New)

まず最近リリースされた ECS コマンド実行について試します。Terraform やその他の周辺の技術 (aws 公式 GitHub Actions 等も)、この機能にはまだ対応していません。awscli (v1, v2), session-manager, aws-sdk-go 等が既に対応しています。ここでは awscli, aws-sdk-go を使ってこの機能を試してみます。

awscli, session-manager, aws-sdk-go は比較的新しいバージョンを事前にインストールする必要があります。

まず taskExecute IAM Role に下記の権限が追加で必要です。

```hcl
  statement {
    effect = "Allow"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel"
    ]
    resources = ["*"]
  }
```

ECS Service に対してコマンド実行の有効化を実施します。

```shell
$ aws ecs update-service \
    --cluster <ClusterArn> \
    --service <ServiceName> \
    --task <TaskName> \
    --enable-execute-command #<--- 有効化
```

次に `--enable-execute-command` オプションを付与して Task を起動します。

```shell
$ aws ecs run-task --cluster <ClusterArn> \
    --task-definition <TaskDefinition:Revision> \
    --network-configuration "awsvpcConfiguration={subnets=["Subnet_ID1", "Subnet_ID2"],securityGroups=["SecurityGroupId"],assignPublicIp=DISABLED}" \
    --launch-type FARGATE --enable-execute-command 
```

準備が整ったので、コマンドを実行してみます。

```shell
aws ecs execute-command --cluster <ClusterArn> \
    --task <TaskId> --container <ContainerName> \
    --interactive --command "ps ax"

The Session Manager plugin was installed successfully. Use the AWS CLI to start a session.

Starting session with SessionId: ecs-execute-command-0b2c79e1e775f274c
PID   USER     TIME   COMMAND
    1 root       0:00 /bin/sh -c nginx -g "daemon off;"
    7 root       0:00 nginx: master process nginx -g daemon off;
    8 nginx      0:00 nginx: worker process
    9 nginx      0:00 nginx: worker process
   10 root       0:00 /managed-agents/execute-command/amazon-ssm-agent
   23 root       0:00 /managed-agents/execute-command/ssm-agent-worker
   72 root       0:00 /managed-agents/execute-command/ssm-session-worker ecs-ex
   80 root       0:00 ps ax


Exiting session with sessionId: ecs-execute-command-0b2c79e1e775f274c.
```

上記の通り、コマンド `ps ax` の結果が得られました。

次に aws-sdk-go を使ってコマンドを実行してみます。

```go
package main

import (
	"fmt"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ecs"
)

func main() {
	svc := ecs.New(session.New(aws.NewConfig().WithRegion("ap-northeast-1")))

	input := &ecs.ExecuteCommandInput{
		Cluster:     aws.String("<ClusterName>"),
		Command:     aws.String("ps aux"),
		Container:   aws.String("<ContainerName>"),
		Interactive: aws.Bool(true),
		Task:        aws.String("<TaskId>"),
	}

	result, err := svc.ExecuteCommand(input)
	if err != nil {
		if aerr, ok := err.(awserr.Error); ok {
			fmt.Println(aerr.Error())
		}
		fmt.Println(err.Error())

		return
	}

	fmt.Println(result)
}
```

これをビルドし、実行すると下記のようなシンタックスで結果が得られます。(参考: https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ExecuteCommand.html)

```json
{
   "clusterArn": "string",
   "containerArn": "string",
   "containerName": "string",
   "interactive": boolean,
   "session": { 
      "sessionId": "string",
      "streamUrl": "string",
      "tokenValue": "string"
   },
   "taskArn": "string"
}
```

残念ながらコマンド結果はレスポンスには入っていないようです。が、コマンドは正常を正常に叩いたかの API レスポンスとしてはエラーも検知出来ます。

### ECS Run Task によるコマンドのオーバーライド

次に ECS Run Task によるコマンドのオーバーライドについて記します。こちらは以前からある機能なのでほぼすべての周辺ツールが対応している認識です。まず awscli で動作確認してみます。

下記の json ファイルを作成して、タスク定義に記してあるコンテナ名と、コマンドを記します。

```json
{
    "containerOverrides": [
        {
           "name": "<ContainerName>",
            "command": [
                "<Command>"
            ]
        }
    ]
} 
```

awscli を用いてコマンドを Overrides しつつ Run Task 実行します。

```shell
aws ecs run-task --cluster <ClusterArn> \
    --task-definition <TaskDefinition:Revision> \
    --network-configuration "awsvpcConfiguration={subnets=["<SubnetId1>", "<SubnetId2>"],securityGroups=["SecurityGroupId"],assignPublicIp=DISABLED}" \
    --launch-type FARGATE \
    --overrides file://<作成した json ファイル>.json
```

結果は API からの応答内容だけでコマンド実行結果は含まれていません。タスク定義で logConfiguration を記していると、そこにコマンド実行結果が出力されます。

ではつぎに aws-sdk-go を使って Run Task してみます。下記のサンプルコードを記します。環境情報は適宜差し替える必要があります。


```go
package main

import (
	"fmt"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/ecs"
)

func main() {
	// svc := ecs.New(session.New(aws.NewConfig().WithRegion("ap-northeast-1")))
	sess := session.Must(session.NewSessionWithOptions(session.Options{
		Config: aws.Config{
			CredentialsChainVerboseErrors: aws.Bool(true),
		},
	}))
	svc := ecs.New(sess)

	input := &ecs.RunTaskInput{
		Cluster:        aws.String("<ClusterArn>),
		TaskDefinition: aws.String("<TaskDefinition:Revision>),
		Overrides: &ecs.TaskOverride{
			ContainerOverrides: []*ecs.ContainerOverride{
				{
					Name:    aws.String("<ContainerName>"),
					Command: aws.StringSlice([]string{"<実行したいコマンドを記す>"}),
				},
			},
		},
		NetworkConfiguration: &ecs.NetworkConfiguration{
			AwsvpcConfiguration: &ecs.AwsVpcConfiguration{
				Subnets:        aws.StringSlice([]string{"<SubnetId1>", "<SubnetId2>"}), // サブネットID
				AssignPublicIp: aws.String("DISABLED"),                                                            // 必要に応じて
			},
		},
		LaunchType: aws.String("FARGATE"),
	}

	result, err := svc.RunTask(input)
	if err != nil {
		if aerr, ok := err.(awserr.Error); ok {
			switch aerr.Code() {
			case ecs.ErrCodeServerException:
				fmt.Println(ecs.ErrCodeServerException, aerr.Error())
			case ecs.ErrCodeClientException:
				fmt.Println(ecs.ErrCodeClientException, aerr.Error())
			case ecs.ErrCodeInvalidParameterException:
				fmt.Println(ecs.ErrCodeInvalidParameterException, aerr.Error())
			case ecs.ErrCodeClusterNotFoundException:
				fmt.Println(ecs.ErrCodeClusterNotFoundException, aerr.Error())
			case ecs.ErrCodeUnsupportedFeatureException:
				fmt.Println(ecs.ErrCodeUnsupportedFeatureException, aerr.Error())
			case ecs.ErrCodePlatformUnknownException:
				fmt.Println(ecs.ErrCodePlatformUnknownException, aerr.Error())
			case ecs.ErrCodePlatformTaskDefinitionIncompatibilityException:
				fmt.Println(ecs.ErrCodePlatformTaskDefinitionIncompatibilityException, aerr.Error())
			case ecs.ErrCodeAccessDeniedException:
				fmt.Println(ecs.ErrCodeAccessDeniedException, aerr.Error())
			case ecs.ErrCodeBlockedException:
				fmt.Println(ecs.ErrCodeBlockedException, aerr.Error())
			default:
				fmt.Println(aerr.Error())
			}
		} else {
			fmt.Println(err.Error())
		}
		return
	}

	fmt.Println(result)
}
```

ビルド & 実行するとレスポンスが得られます。がこちらもレスポンスにはコマンド結果が入っていないので、awscli の際と同様にタスク定義内で logConfiguration を指定してログ送信設定を行うと良いでしょう。Cloudwatch Logs などを介して、コマンド実行結果を確認することが可能です。

## まとめ

それぞれの良い点・悪い点を下記にまとめてみました。

### Command Exec の特徴

- Terraform, aws 公式 [GitHub Actions](https://github.com/aws-actions/amazon-ecs-render-task-definition) 等がまだ対応していない
- awscli ではコマンド結果が得られるが aws-sdk を用いると API のレスポンスにコマンド結果が入ってない
- 実行する際には TaskId を指定。よって予め Run Task などで Task を起動させるのが前提になる

### Run Task の特徴

- 古くからある機能で公式・周辺の技術が対応済み
- コマンド実行結果は Task 定義に記した logConfiguration に転送することが可能 (Cloudwatch, Datadog 等など)
- 実行する際には Task Defintion を指定。予め Task が起動している必要はない。

それぞれ特徴がありますが、Execute Command の方はコマンド結果を得る方法が今の所、別途仕組みを用意する必要がありそうです。ログ転送や、Task を別途起動しておく必要が無い点、またコマンド実行終了と共に Task が自動的に終了してくれる点など、自動化する上では Run Task が好ましいなぁと感じています。

今後 Execute Command がどう変わってくるか期待ですが、awscli を使って単純にデバッグしたい等の要望の時には重宝しそうだなと感じてます。
