# WapLでWebAssemblyにビルドする

## 環境構築

waplc_v0.2以降ではWebAssembly(以下wasm)向けビルドに対応しています。またwapl-cliが古いとwapl-cliでのwasm向けビルドに対応していないことがあるのでその場合は[第1章のWapLを導入](./install_1_1.md)にある最初のコマンドで更新してその後`waplup update`で`waplc`の更新をしてください。

まずはwasm向けにビルドするためにまずはwasmに対応したclangや.wasmから.watファイルを作るツールをインストールします、すでにこれらがインストールされている場合はwapl.tomlファイルに設定を書くところまで飛ばして大丈夫です。

wgetがなければインストール
```bash
$ sudo apt update
```
```bash
$ sudo apt install -y wget gnupg
```
wasi-sdkをインストール(バージョンはLLVM-21に対応しているもの)
```bash
$ wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-29/wasi-sdk-29.0-x86_64-linux.tar.gz
```
```bash
$ tar xf wasi-sdk-29.0-x86_64-linux.tar.gz
```
wasmの実行のためのランタイムをインストール
```bash
$ wget https://github.com/bytecodealliance/wasmtime/releases/download/v40.0.0/wasmtime-v40.0.0-x86_64-linux.tar.xz -O wasmtime.tar.xz
```
```bash
$ tar -xf wasmtime.tar.xz 
```
.watファイルを生成するためのツールをインストール
```bash
$ sudo apt install wabt
```

ではここからwapl.tomlに設定を書きます。ここの例は上記のインストール方法で環境を整えた場合の設定です
```toml
[wasm]
input = "src/main.wapl"
output = "target/プロジェクト名.wasm"
opt = "O3"
clang = "$HOME/wasi-sdk-29.0-x86_64-linux/bin/clang"
bitsize = "32"
sysroot = "$HOME/wasi-sdk-29.0-x86_64-linux/share/wasi-sysroot"
wasm2wat = "wasm2wat"
wat = "src/プロジェクト名.wat"
wasmruntime = "$HOME/wasmtime-v40.0.0-x86_64-linux/wasmtime"
memory-size = "655360"
```
それぞれの項目について説明します。

`input`,`output`,`opt`,`clang`,`bitsize`、に関しては`[build]`のときと同じです。clangのところはちゃんとwasmに対応したものに切り替えておきましょう。`sysroot`にはwasi-sdkのshare/wasi-sysrootのパス、`wasm2wat`にはwasm2watのパス、`wat`は生成される.watファイルの名前、`wasmruntime`はwasmtimeのパス、`memory-size`にはwasmでのヒープmemoryのサイズです。

ここまで設定できたら
```bash
$ wapl-cli wasm
```
でビルド
```bash
$ wapl-cli wasm_run
```
でビルド&実行
```bash
$ wapl-cli wasm_browser
```
でエントリーポイントやlibc無しでビルド

のようにしてビルドすることができます。
`wapl-cli wasm`や`wapl-cli wasm_run`でビルドするときはエントリーポイントを作るのであれば`__main_void():i32`または`__main_argc_argv(i32 argc, ptr:ptr:char argv):i32`としてください。また`wapl-cli wasm_browser`ではlibcとリンクして使っていた`malloc`や`printf`などの関数が使えなくなりますしそれらを内部で使っているため標準ライブラリのstdにあるものも一部使えません。さらに`println`や`format`などの組み込み関数も内部ではlibcを使っているため使えなくなります。そのため代替となる関数を組み込み関数と名前衝突が起こらないように作って使ってください。

## WASM向けビルドをして実行するまでのチュートリアル

### とりあえずプロジェクトの作成からビルド&実行

```bash
$ cd ~/projects/
$ wapl-cli new hello_wasm
$ cd hello_wasm
```
まず`hello_wasm`プロジェクトを作ります。

次に自分の環境に合わせてwapl.tomlファイルに設定を書いてください。

次に`./src/main.wapl`を以下のように書き変えてください。

```wapl
fn __main_void():i32{
    println("Hello, WASM!");
    return 0s;
}
```
これで
```bash
$ wapl-cli wasm_run
```
とすることでビルド&実行されて
```
Hello, WASM!
```
と表示されるはずです。ポイントとしてはネイティブでは`main():i32`だったエントリーポイントが`__main_void():i32`になっていることです。

### ブラウザで動くものを作ってみよう

ここではWapLを`wapl-cli wasm_browser`を使ってビルドしてWapLで作った関数をTypeScriptという言語から呼んでブラウザで表示するというものを作ってみましょう。プロジェクトは先ほど作った`hello_wasm`を流用します。まず、Node.jsやTypeScriptの環境がない場合はその環境を構築します。以下の環境構築方法は筆者が行った例です。自分の環境に合わせた方法で行ってください。
```bash
$ cd ~
$ curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
$ export NVM_DIR="$HOME/.nvm"
$ [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
$ nvm install --lts
$ nvm use --lts
$ node -v
$ npm -v
$ cd projects/hello_wasm/
$ npm init -y
$ npm install --save-dev typescript ts-node @types/node
$ tsc --init
$ npm install --save-dev vite
```
これで`hello_wasm`プロジェクトでNode.jsでTypeScriptを使う環境が整いました。以降はプロジェクトで`npm init -y`と`tsc --init`さえすればいつでもNode.jsが使えるようになります。

次はWapLのWASM向けライブラリ**wasmpl**を取得します。
```bash
$ wapl-cli get_lib wasmpl 0.1.2
```
ここではwasmplのバージョン0.1.2を取得しましたが、今回使う機能はこの0.1.2時点である機能で十分なのでこのバージョンにしています。WapL標準ライブラリstdにあるものを順次wasmplにも同様のwasm版のを作っていっているのでそれらが使いたい場合はより新しいバージョンであればあるかもしれません。

次に./src/main.tsを作ります。ここにWapLの関数を呼び出すTypeScriptのコードを書いていきます。

次は./index.htmlを作ります。

ここからコードを書いていきます。このチュートリアルではWapLで整数`n`を受け取って`n`項までのフィボナッチ数列の配列を返す関数を作って、それをTypeScriptから呼んで配列の要素すべてを画面上に表示するようなものを作ります。

index.htmlには以下のように書きます。
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WapL Fibo</title>
</head>
<body>
  <h1>WapL Fibonacci</h1>

  <label for="inputN">n = </label>
  <input type="number" id="inputN" value="10" min="0" />
  <button id="calcBtn">計算</button>

  <pre id="output"></pre>

  <script type="module" src="./src/main.ts"></script>
</body>
</html>
```

./src/main.waplには以下のようにフィボナッチ数列を作る`fibo(isize):*:isize`という形の関数を作って`export`することでTypeScript側で呼べるようにします。
```wapl
use "./lib/wasmpl/wasmpl_all.wapl" // wasmplにあるものをすべて使えるようにする

fn fibo(isize n):*:isize{
    #=(sz,sizeof(isize),isize);
    // 配列のためのメモリをヒープ上に確保
    // ここでは組み込み関数のmallocがlibc依存のため使えないのでwasmplにあるmalloc_wasmを使う
    #=(arr,malloc_wasm(*(n,sz)),*:isize); 

    if(<=(n,1_)){
        =(arr,Array(1_));
        return arr;
    }

    =(arr,Array(1_,1_)); // 初項
    #=(i,2_,isize);
    // フィボナッチ数列を計算
    loopif:(<(i,n)){
        =([](arr,i),+([](arr,-(i,1)),[](arr,-(i,2))));
        =(i,+(i,1_));
    }
    
    // *:isizeの型で配列を返す
    return pmove(arr);
}

export fibo; // exportして外から呼べるようにする
```

そしたら、TypeScriptで`fibo`を呼び出す処理を./src/main.tsに書き込みます。
```ts
async function main() {
    const response = await fetch("/target/hello_wasm.wasm"); // WapLをビルドして作られた.wasmファイルを取得
    const bytes = await response.arrayBuffer();

    const imports = { env: {} };
    const wasmModule = await WebAssembly.instantiate(bytes, imports);
    const exports = wasmModule.instance.exports as any; // exportされているWapLの関数を取得

    exports.__init_wasm(); // wasmplにあるmalloc_wasmやfree_wasmを使っているためメモリの初期化とかをするために__init_wasmを呼ぶ必要がある

    const memory = exports.memory as WebAssembly.Memory;

    const inputN = document.getElementById("inputN") as HTMLInputElement; // nの入力する場所を指定
    const calcBtn = document.getElementById("calcBtn")!; // 計算ボタンを指定
    const output = document.getElementById("output")!; // 結果を表示する場所を指定

    calcBtn.addEventListener("click", () => {
        const n = parseInt(inputN.value);
        if (isNaN(n) || n < 0) {
            output.textContent = "0以上の整数を入力してください";
            return;
        }

        // WapLで作ったfibo を呼び出す
        const ptr = exports.fibo(n) as number;

        // Int32Array を作ってコピー
        const memView = new Int32Array(memory.buffer, ptr, n);
        const result = Array.from(memView);

        // 描画
        output.textContent = `fibo(${n}) = [${result.join(", ")}]`;

        // メモリ解放
        exports.free_wasm(ptr);
    });
}

main();
```
これでコードは書き終わったのでビルドしてブラウザで開いてみましょう。

WapLのビルド
```bash
$ wapl-cli wasm_browser
```

全体のビルド&実行
```bash
$ npx vite
```
これで表示されるURLをブラウザで開けば以下のように表示されるはずです。

<img src="./picture/hello_wasm_fibo1.png" width="400">

`計算`ボタンを押すと

<img src="./picture/hello_wasm_fibo2.png" width="400">

のように表示することができるものが作れました。