# 制御フロー

**point/warpto文**

WapLで最も基本となる制御フローは`point/warpto`文です。これは多くの言語でのgoto文に近い概念で非常に自由度の高い処理が書けます。`point`でラベルをつけてブロックを作り、`warpto`でそこまでジャンプします。`warpto`は
```wapl
fn main():i32{
    warpto(skip);
    point skipped;
        println("この行は飛ばされるよ");
        warpto(skip);
    point skip;
    
    println("skipに飛んだよ");
    return 0s;
}
```
```bash
skipに飛んだよ
```
これでは`skipped`と`skip`というラベルでブロックを作り、`warpto(skip)`で`skip`に飛びます。すべてのブロックが`return`か`warpto`/`warptoif`のどれかで終わる必要があります。

**warptoif文**

`warptoif`は`warpto`に条件を付けて真のときと偽のときで飛ぶ先を選択するもので`warptoif(条件, 真のとき, 偽のとき)`となります。
```wapl
fn main():i32{
    #=(cond, true, bool);
    warptoif(cond, then, else);
    point then;
        println("then");
        warpto(end);
    point else;
        println("else");
        warpto(end);
    point end;
    return 0s;
}
```
このようにして条件分岐を作ることもできますし、後述する`loopif`も内部では`point`/`warpto`/`warptoif`と同じようなことがされています。

**loopif文**

`loopif`は他の多くの言語で存在する`while`のようなもので、名前を付けたり`warpto`/`warptoif`にも対応しています。
```wapl
fn main():i32{
    #=(i,0,i64);
    loopif:(<(i,10)){
        println(format("%d",i))
        =(i,+(i,1));
    }

    =(i,0)
    loopif:LOOP1(<(i,10)){
        println(format("LOOP1:%d",i))
        =(i,+(i,1));
        warptoif(<(i,5),continue-LOOP1,break-LOOP1);
    }

    return 0s
}
```
```bash
0
1
2
3
4
5
6
7
8
9
LOOP1:0
LOOP1:1
LOOP1:2
LOOP1:3
LOOP1:4
```
このように`loopif`は名前ありでも名前なしでも作ることができ、ループを抜けたいときは`break-名前`に飛ぶことで抜けることができ、以下の処理をせずに条件の評価に戻りたいときは`continue-名前`に飛ぶことでできる。

**if文(0.1.13以降)**

多くの言語で見られるif文。言語によってはif文とif式は同じ文法で記述できるものもありますが、WapLでは異なるキーワードを使っています。

if文は以下のように使うことができます
```wapl
fn main():i32{

    if (true){
        println("True");
    }
    if (false){
        println("False");
    }
    return 0s;
}
```
```bash
True
```
このように`if`のあとの`()`の中に`bool`型で条件を書き、`true`のときには`{}`の中の処理が実行されます。

**elifとelse**

if文で前の条件が`false`であるときに`false`側でも処理をしたいときに毎回`if`で前の条件が`false`であるときを指定するのはめんどくさいです。そこで使えるのが`elif`と`else`です。

```wapl
fn main():i32{
    #=(x, 7, i64);
    if (>(x, 10)){
        println(format("%lld > 10",x));
    }elif (>(x, 5)){
        println(format("5 < %lld <= 10",x));
    }else{
        println(format("%lld <= 5",x));
    }
    return 0s;
}
```
```
5 < 7 <= 10
```
このように前の条件が`false`であることを前提にして条件を書いたり、その他の場合を記述できます。

**?演算子**

これはif式に相当する演算子です。中には文は書けないのでもし文を書きたい場合は関数を作ってその関数を呼ぶようにしてください。

```wapl
fn main():i32{
    #=(x, ?(false,10,5), i64);
    println(format("x = %lld", x));
    return 0s;
}
```
```
x = 5
```
このように第1引数に条件を書き、続けて`true`のときの値、`false`のときの値を書きます。このとき値の型は一致していてさらに`void`であってはいけません。
```wapl
fn Hello(){
    println("Hello");
}
fn Bye(){
    println("Bye");
}

fn main():i32{
    ?(true,Hello(),Bye());
    return 0s;
}
```
```bash
src/main.ll:56:1: error: expected instruction opcode
   56 | if.merge:                                         ; No predecessors!
      | ^
1 error generated.
```
このように`void`の場合エラーが出ます。これを回避するためには以下のようにして意味がなくとも戻り値を持たせる必要があります。
```wapl
fn Hello():i32{
    println("Hello");
    return 0s;
}
fn Bye():i32{
    println("Bye");
    return 0s;
}

fn main():i32{
    ?(true,Hello(),Bye());
    return 0s;
}
```
```bash
Hello
```

**choose**

`?`演算と似たようなものとして`choose`があります。違いとしては`?`は片方しか評価しない一方`choose`は両方を評価してから条件に合う値を返します。先ほどのHelloとByeの`?`を`choose`に書き変えて試してみましょう。
```wapl
fn Hello():i32{
    println("Hello");
    return 0s;
}
fn Bye():i32{
    println("Bye");
    return 0s;
}

fn main():i32{
    choose(true,Hello(),Bye());
    return 0s;
}
```
```
Hello
Bye
```
このようにHello/Byeともに実行されたことが確認できます。