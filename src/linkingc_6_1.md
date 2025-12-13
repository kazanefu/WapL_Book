# C言語標準ライブラリとリンク

WapLではC言語の標準ライブラリとリンクして関数や構造体を使うことができます。

**関数のリンク**

関数をリンクさせるには関数名とシグネチャを一致させて`declare`で宣言するだけでよいです。

```wapl
declare printf(ptr:char,...):i32

fn main():i32{
    printf("Hello, %s\n","WapL");
    return 0s;
}
```
これだけでC言語の標準ライブラリの`printf`が使えます。

**構造体のリンク**

こっちは関数よりももっと簡単で単に同じ名前で中のフィールドの型も一致させるだけでC言語の構造体と同じものとして扱うことができます。これはWapL標準ライブラリの`time.wapl`でも使っているのでそれを例に見てみましょう。
```wapl
struct timespec {
    i64 tv_sec,
    i64 tv_nsec,
}

declare timespec_get(ptr:timespec, i32):i32;
declare nanosleep(ptr:timespec, ptr):i32;

fn Time_get(&mut:timespec ts):i32{
    #=(i,1,i64);
    return timespec_get(ts, *_(&_(i),i32));
}
fn Time_sleep(&mut:timespec ts):i32{
    #=(null,_,ptr);
    return nanosleep(ts, null);
}
fn Time_new():timespec{
    #=(time,_,timespec);
    =(.(time,tv_sec),0);
    =(.(time,tv_nsec),0);
    return time;
}
fn Time_delta(timespec start,timespec end):f64{    
    #=(sec_diff, -(.(end,tv_sec), .(start,tv_sec)), i64);
    #=(nsec_diff, -(.(end,tv_nsec), .(start,tv_nsec)), i64);

    #=(elapsed, 
        +(as_f64(sec_diff), *(as_f64(nsec_diff), 0.000000001)),
        f64
    );

    return elapsed;
}
fn Time_now():timespec{
    #=(time,_,timespec);
    =(.(time,tv_sec),0);
    =(.(time,tv_nsec),0);
    #=(i,1,i64);
    timespec_get(&_(time), *_(&_(i),i32));
    return time;

}
fn Time_as_f64(timespec ts):f64{
    #=(sec_diff, .(ts,tv_sec), i64);
    #=(nsec_diff,.(ts,tv_nsec), i64);

    #=(f_num, 
        +(as_f64(sec_diff), *(as_f64(nsec_diff), 0.000000001)),
        f64
    );
    return f_num;
}
```

ここではC言語の`timespec`という構造体を同じ形式でWapLでも定義することでC言語の関数の`timespec_get`や`nanosleep`などへの引数として渡すことができています。