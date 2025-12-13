# 標準ライブラリを使う

`wapl-cli new`を使ってプロジェクトを作った場合はすでに`std`というディレクトリが作られてその中に標準ライブラリのファイルが入っていると思います。もしそうでなければ`wapl-cli std_load`でデフォルトに設定されているwaplcのバージョンに合わせた標準ライブラリを取得することもできます。
```bash
$ wapl-cli std_laod
```

標準ライブラリも[ファイルをつなげる](./mulfile_5_1.md)で説明した方法で使うことができます。例えば標準ライブラリにある`time.wapl`を使いたいときは以下のように`use "./std/time.wapl"`とすることで使えます。
```wapl
use "./std/time.wapl"
fn main():i32{
    #=(start, Time_now(),timespec);
    
    #=(i,0,i64);
    loopif:(<(i,10000000)){
        print("WapL");
        =(i,+(i,1));
    }
    println("");

    #=(end, Time_now(), timespec);

    println(format("%g秒経過",Time_delta(start,end)));

    return 0s;
}
```
また、すべての標準ライブラリを一括でつなげたいときは`use "./std/allstd.wapl"`でできます。

**標準ライブラリの紹介**

|名前|機能|
|-|-|
|allstd|すべての標準ライブラリを一括でuse|
|assign_and_cal|インクリメント`++`や`+=`といった計算と代入を同時に行う関数を提供|
|HelloWorld|Hello World!と表示するだけの関数がある|
|iterator|イテレータ(0.1.9現在まだ作り途中)|
|longinput|入力を配列で受け取るための関数がある|
|math|絶対値を返す関数や`math_PI`や`math_E`で数学の定数を返す|
|sort|ソートをする関数のコレクション|
|String|String型(文字列のポインタ,長さ,容量からなる)の構造体とそれに関連する関数がある|
|time|時間の取得や停止|
|utility|いろいろ|
|VecT|VecT型(任意型の配列,長さ,容量,型のバイト数からなる)任意型の配列の構造体とそれに関連する関数がある|

**ライブラリを作って公開する**

[https://github.com/kazanefu/WapL_Library](https://github.com/kazanefu/WapL_Library)にライブラリのフォルダを追加してライブラリ名でブランチを切ってpushしてプルリクをください。