# Chapter 1

```wapl
use "./std/allstd.wapl"

fn main(){
    //#=(n,_,i64);
    scanf("%lld",ptr(n));
    #=(a,input_Strings(n),ptr:String);

    qsort_String(a,0,-(n,1));
    #=(i,0,i64);
    loopif:(<(i,n)){
        println(format("%s",[](a,i)));
        ++(&_(i));
    }
    =(i,0);
    self
    loopif:(<(i,n)){
        #=(j,0,i64);
        loopif:(<(j,.([](a,i),len))){
            println(format("%c",String_get(&_([(())](a,i)),j)));
            
            ++(&_(j));
        }
        println("--------------------------------------------");
        ++(&_(i));
    }

    println("fin");
}
main();
```