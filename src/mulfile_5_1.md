# ファイルをつなげる

**他ファイルの関数や構造体を使う**

以下のようなファイル構成のときを例に説明します
```bash
src
├── SayHello.wapl
└── main.wapl
```
`ファイル:SayHello.wapl`にある以下の関数を`ファイル:main.wapl`で呼びたいです。
```wapl
fn Hello(){
    println("HELLO!!!!!");
}
```
こんな時には`use`キーワードを使ってつなげたいファイルのパスをしていします。

`ファイル:main.wapl`
```wapl
use "./src/SayHello.wapl"
fn main():i32{
    Hello();
    return 0s;
}
```
パスは文字列リテラルと同じでダブルクォーテーションで囲んで書きます。

同様に構造体も持ち込むことができます。

以下のようなファイル構成のときを例に説明します。
```bash
src
├── Complex.wapl
└── main.wapl
```
`ファイル:Complex.wapl`
```wapl
struct Complex{
    f64 re,
    f64 im
}
fn Complex_new(f64 re,f64 im):Complex{
    #=(cplx, _, Complex);
    =(.(cplx,re), re);
    =(.(cplx,im), im);
    return cplx;
}
fn Complex_show(Complex c){
    println(format("c = %g + %gi",.(c,re),.(c,im)));
}
```
この複素数の構造体を`ファイル:main.wapl`で使います。
```wapl
use "./src/Complex.wapl"
fn main():i32{
    #=(c, Complex_new(1.0,2.0), Complex);
    Complex_show(c);
    return 0s;
}
```

このようにして複数ファイルで開発をすることができます。