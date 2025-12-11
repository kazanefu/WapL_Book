# 関数

WapLでは1.2で述べたように基本的に`main`関数がエントリーポイントになります。しかし、`main`以外の関数をエントリーポイントのようにすることも可能です。
```wapl
fn start(){
    println("Hello, Start!");
}
start();
```
これは内部的には一番最後の`start()`の呼び出しが`_TOPLEVEL_`という見えない関数に入れられて、`_TOPLEVEL_`が最初に呼ばれて関数の外に書いてある処理を順に行うので`start`関数が呼ばれています。

WapLでは関数は必ず関数の呼び出しより上で関数の定義がされている必要があります。
```wapl
fn main():i32{
    another();
    return 0s;
}
fn another():void{
    println("Hello, from another function!");
}
```
```bash
Function another not found
```
のようにエラーがでます。これを正しく動くようにするためには以下のような順で書く必要があります。
```wapl
fn another():void{
    println("Hello, from another function!");
}
fn main():i32{
    another();
    return 0s;
}
```
または宣言だけを先に置くことでも解決できます:
```wapl
declare another():void;
fn main():i32{
    another();
    return 0s;
}
fn another():void{
    println("Hello, from another function!");
}
```
このように関数の定義は`fn`、宣言は`declare`で行います。

**関数の引数**

引数は関数のシグネチャの一部になる特別な変数のことで、宣言時には実引数は作らなくてよく、`()`の中に型のみを`,`区切りで列挙し、関数の宣言のときは型と変数名を書きます。
```wapl
declare another_function(i64,i64);
fn main():i32{
    another_function(5,3)
    return 0s;
}
fn another_function(i64 x,i64 y){
    println(format("%d,%d",x,y));
}
```

**戻り値のある関数**

引数を書いた括弧の後ろに戻り値がある場合は`:`で区切ってその後に戻り値の型を書きます。また`return`で戻り値を返します。:

```wapl
fn five():i64{
    return 5;
}
fn main():i32{
    println(format("five() return %d",five()));
    return 0s;
}
```
ここでは`five`関数の戻り値の型は`i64`で`return`で`5`を返しています。`declare`で宣言をするときも同様です。
```wapl
declare five():i64;
fn main():i32{
    println(format("five() return %d",five()));
    return 0s;
}
fn five():i64{
    return 5;
}
```