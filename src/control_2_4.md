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