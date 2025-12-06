# インストール

まず、Githubのreleaseからインストーラを起動してwaplupとwapl-cliをインストールします。その後、waplupを使ってコンパイラwaplcをインストールします

## Linuxにインストールする

>注:WapLでは内部でClangを使うので事前にインストールしておいてください。もし関数がリンクできない等のエラーが出る場合はCのライブラリが不足している可能性がありますので確認してください。WapLではClangは2025/12/7現在21.1.6を推奨しています

bashで以下のコードを実行してください
```bash
$ curl -fsSL https://github.com/kazanefu/WapL_Compiler/releases/latest/download/installer.sh | bash
```
成功していれば以下のような出力がされるでしょう:
```bash
Installing WapL toolchain...
Installation complete!
Please reload your shell: source ~/.bashrc
Example: waplup install latest
Recommendation: if you need syntax highlighting for VScode, visit here https://github.com/kazanefu/WapL_SyntaxHighLight/releases/
Require: if you don't have Clang installed yet, install it.
```
続いてwaplupを使ってwaplcをインストールします。バージョンを指定してインストールしたい場合は以下のコマンドの`latest`をバージョンの数字に置き換えてください
```bash
$ waplup install latest
```
成功していれば以下のように出るはずです(これはversion 0.1.5をインストールした場合の例です):
```bash
Installed version 0.1.5
```

## トラブルシューティング
waplcが正常にインストールされているか確認するには以下のコマンドを実行してください:
```bash
$ waplc --version
```
正常にインストールされていれば以下の形式でデフォルトに設定されているバージョンが表示されるはずです。
```bash
waplc x.y.z
```

## 複数のバージョンを管理とアンインストール

waplup経由でwaplcをインストールした場合簡単にバージョンの切り替えやアンインストールができます。
waplを最新のバージョンに更新したい場合は以下のコマンドを実行してください:
```bash
$ waplup update
```
waplcのデフォルトのバージョンを変更するには以下の形式でバージョンを指定してください:
```bash
$ waplup default x.y.z
```
インストール済みのwaplcのバージョンを確認するには以下のコマンドを実行してください:
```bash
$ waplup list
```
現在のデフォルトのバージョンを確認するには以下のコマンドを実行してください:
```bash
$ waplup show
```
アンインストールする場合は以下のようにバージョンを指定して特定のバージョンのみをアンインストールするか,`all`を指定してwaplupやwapl-cliも含めてすべてアンインストールすることができます:
```bash
$ waplup uninstall x.y.z
```
```bash
$ waplup uninstall all
```
