# wapl-cliを使う

wapl-cliはWapLプロジェクトの作成、標準ライブラリの取得、ビルド/リリースビルドを簡単にすることができるCLIツールです。これによってプロジェクトの開始からリリースまでより簡単にできるようになります。以降はwapl-cliを使用することを想定しています。まずはwapl-cliが使える状態にあるか確認してください。
```bash
$ wapl-cli --help
wapl-cli commands:
  new <name>
  build
  std_load
  run
```
このようにwapl-cliのコマンド一覧が出てきたら成功です。もし失敗したら場合は[「WapLを導入」](./install_1_1.md)に戻ってインストーラを呼んでください。

## wapl-cliでプロジェクトを作成する

wapl-cliを使って新しいプロジェクトを作成しましょう。まずは**projects**ディレクトリに戻ってください。ここではとりあえず名前を**hello_wapl_cli**という名前でプロジェクトを作成します。
```bash
$ wapl-cli new hello_wapl_cli
$ cd hello_wapl_cli
```
これによって**hello_wapl_cli**という名前のプロジェクトを作成できました。**hello_wapl_cli**ディレクトリの中は以下のようになってるはずです。
```bash
.
├── src
│   └── main.wapl
├── std
│   ├── HelloWorld.wapl
│   ├── String.wapl
│   ├── VecT.wapl
│   ├── allstd.wapl
│   ├── assign_and_cal.wapl
│   ├── iterator.wapl
│   ├── longinput.wapl
│   ├── math.wapl
│   ├── sort.wapl
│   ├── time.wapl
│   └── utility.wapl
└── target
```
**src**にmain.waplがあり、main.waplには以下のコードが書かれています。
```wapl
fn main():i32{ println("Hello, WapL!"); return 0s; }
```
また、**std**には標準ライブラリが入っています。
>注釈:上記の標準ライブラリの中身はバージョン0.1.5時点のものです。バージョンによって内容物が異なってる場合があります。

また、**target**というディレクトリも作られています。ここにはwapl-cliを使ってビルドした実行ファイルが保存される場所になります。

## wapl-cliでビルド/実行する

**hello_wapl_cli**ディレクトリにいることを確認して以下のコマンドで`main.wapl`のコードをビルドします。
```bash
$ wapl-cli build
LLVM IR output: ./src/main.ll
Build success! → ./target/hello_wapl_cli
Build complete: ./target/hello_wapl_cli
```
のように出れば成功です。場合によっては以下のように警告が出ることがありますが動作には問題ありません。
```bash
warning: overriding the module target triple with xxx [-Woverride-module]
1 warning generated.
```
ビルドしたことで`./target/hello_wapl_cli`にプロジェクトの名前で実行可能ファイルが作られ、`./src/main.ll`に中間言語のLLVM IRのファイルが生成されます。もし他の言語で作ったものでWapLで作ったものとリンクさせたい場合はこのIRを使うことができます。

以下のように実行することができます。
```bash
$ ./target/hello_wapl_cli 
Hello, WapL!
```

先ほど`wapl-cli build`でビルドし、`./target/hello_wapl_cli `で実行しましたが、`wapl-cli run`でこの二つを一つのコマンドですることもできます。
```bash
$ wapl-cli run
LLVM IR output: ./src/main.ll
Build success! → ./target/hello_wapl_cli
Build complete: ./target/hello_wapl_cli
Hello, WapL!
```

リリースに向けてビルドする場合は`wapl-cli release`を使います。これにより、ClangのO3相当の最適化をした状態でビルドをすることができますが、`wapl-cli build`と比較してビルドには時間が長くなるため、`wapl-cli build`は開発時に素早く頻繁に再ビルドしたいとき用で、`wapl-cli release`は最終的なビルドのとき用です。

wapl-cliはたいていの場合waplcを直接使うより便利ですが、内部で使用するClangの指定や実行ファイルを作らずにIRのみ作成、デバッグ用にASTをすべて出力するなどの細かい設定をしたい場合はwaplcを直接使う必要があります。

