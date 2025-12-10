# WapLコンパイラの作り方

## 環境:
- WSL2: Ubuntu24.04
- Rust 1.91.1
- Clang/LLVM 21.1.6
- inkwell 0.7.1


**Rustをインストール**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```
バージョン確認
```bash
rustc --version
cargo --version
```

**LLVMのビルドとかで必要なものたちをインストール**

```bash
sudo apt install -y build-essential cmake ninja-build git python3 libffi-dev
```

**LLVM 21.1.6 のソースコードをダウンロード**
```bash
cd ~
git clone https://github.com/llvm/llvm-project.git --branch llvmorg-21.1.6 --depth=1
```
**LLVM をビルド**
```bash
cd ~/llvm-project
mkdir build
cd build

cmake -G Ninja ../llvm \
    -DCMAKE_BUILD_TYPE=Release \
    -DLLVM_ENABLE_PROJECTS="clang;lld;polly" \
    -DLLVM_TARGETS_TO_BUILD="X86" \
    -DLLVM_ENABLE_RTTI=ON \
    -DLLVM_ENABLE_EH=ON \
    -DLLVM_ENABLE_TERMINFO=OFF \
    -DLLVM_ENABLE_Z3_SOLVER=OFF \
    -DLLVM_ENABLE_BINDINGS=OFF \
    -DLLVM_ENABLE_LIBXML2=OFF \
    -DLLVM_ENABLE_ZSTD=OFF \
    -DLLVM_ENABLE_ASSERTIONS=OFF \
    -DCMAKE_INSTALL_PREFIX=/usr/local/llvm-21
```
```bash
ninja -j$(nproc)
```
ビルドには少し時間がかかります

**LLVMをインストール**
```bash
sudo ninja install
```
**パスを通す**
```bash
echo 'export PATH=/usr/local/llvm-21/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/llvm-21/lib:$LD_LIBRARY_PATH' >> ~/.bashrc
echo 'export LLVM_SYS_210_PREFIX=/usr/local/llvm-21' >> ~/.bashrc
source ~/.bashrc
```
バージョン確認
```
Clang --version
llvm-config --version
```

## WapLコンパイラの大まかな設計

```
1.コードを書いたファイルを文字列として読み込む
↓
2.文字列からトークン列に変換する
↓
3.トークン列から抽象構文木(Abstruct Syntax Tree以後AST)を作る
↓
4.ASTから意味解析や超簡易的な所有権/借用のチェックと同時に中間言語としてLLVM IRを生成
↓
6.LLVM IRをClangに投げて最適化や実行ファイルの作成をしてもらう
```
一応2~4についてそれぞれ軽く説明します。
### 2.文字列からトークン列に変換する
```wapl
fn main():i32{
    println("Hello, world!");
    return 0s;
}
```
```rust
0:Fn
1:Ident("main")
2:Lsep(LParen)
3:Rsep(RParen)
4:Colon
5:Ident("i32")
6:Lsep(LBrace)
7:Ident("println")
8:Lsep(LParen)
9:StringLiteral("Hello, world!")
10:Rsep(RParen)
11:Semicolon
12:Return
13:IntshortNumber(0)
14:Semicolon
15:Rsep(RBrace)
```
文字列からトークン列に変換する段階では上のように文字列を**意味のある最小単位**に分割していきます。
WapLではトークンは大きく**識別子**,**定数値**,**予約語**,**区切り記号**の4種類があり、一般的な言語にある**演算子**などはすべて識別子に統合されています。これはほとんどすべて関数呼び出しの記法と同じ記法で書くため演算子も関数名として扱ってしまうことができるからです。

WapLでのトークンの構成
```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    //識別子
    Ident(String), //変数名や関数名
    //定数値
    IntNumber(i64), //整数値
    FloatNumber(f64), //浮動小数点数
    IntshortNumber(i32),// 32bit整数
    FloatshortNumber(f32),// 32bit 浮動小数点数
    StringLiteral(String), //ダブルクォーテーションで囲んだ文字列
    CharLiteral(char), //シングルクォーテーションで囲んだ文字
    BoolLiteral(bool), // true と false
    // キーワード
    ArrayCall, // Array(e1,e2,e3,...)のように配列を書くため他の関数呼び出しとの区別用
    Fn, //関数 fn
    Struct, //構造体 struct
    Point, //ラベル設置 point
    Warpto, //ジャンプ warpto
    WarptoIf, //条件付きジャンプ warptoif
    Return, //戻り値 return
    Import, //他ファイルを取り込む use
    LoopIf, //名前&条件付き繰り返し loopif
    Declare, //関数の宣言のみ declare
    //記号や括弧
    Comma,// ","
    Semicolon, // ";"
    Colon, // ":"
    Lsep(LSeparator), //括弧の左側
    Rsep(RSeparator), //括弧の右側

    EOF, // 終わり
}
#[derive(Debug, Clone, PartialEq)]
pub enum LSeparator {
    LParen, // "("
    LBrace, // "{"
}
#[derive(Debug, Clone, PartialEq)]
pub enum RSeparator {
    RParen, // ")"
    RBrace, // "}"
}
```
### 3.トークン列からASTを作る

2.で生成したトークン列は以下のように変換されます
```rust
Function(
    Function { 
        name: "main", 
        return_type: Ident("i32"), 
        args: [], 
        body: [
            Stmt { 
                expr: Call { 
                    name: "_TOPLEVEL_", 
                    args: [] 
                } 
            }, 
            Stmt { 
                expr: Call { 
                    name: "println", 
                    args: [
                        String("Hello, world!")
                    ] 
                } 
            }, 
            Stmt { 
                expr: Return([
                    IntSNumber(0)
                ]) 
            }
        ] 
    }
)
```
>注:WapLでは`main`関数の初めに`_TOPLEVEL_`を呼んで関数の外に書いた処理を先に行うため自動で`_TOPLEVEL_`が加えられている。

このようにトークン列をASTにすることで上のように構造を持たせてトークンどうしの関係を表現することができます。WapLでのASTの構造は以下のように定義されています。
```rust
#[derive(Debug, Clone)]
pub enum Expr {
    IntNumber(i64),          //i64リテラル
    FloatNumber(f64),        //f64リテラル
    IntSNumber(i32),         //i32リテラル
    FloatSNumber(f32),       //f32リテラル
    String(String),          //文字列リテラル
    Char(char),              //charリテラル
    Bool(bool),              //boolリテラル
    ArrayLiteral(Vec<Expr>), //Array(e1,e2,e3,...)という形の配列リテラル
    Ident(String),           //変数名,型名,ワープに使うラベル名前などStringではない文字列
    Return(Vec<Expr>),       //関数の返り値
    Point(Vec<Expr>),        //ワープに使うラベル
    Call {
        name: String,
        args: Vec<Expr>,
    }, //関数呼び出し
    Warp {
        name: String,
        args: Vec<Expr>,
    }, //warpto,warptoif
    StructVal {
        _name: String,
        _args: Vec<Expr>,
    }, //structの実体
    TypeApply {
        base: String,
        args: Vec<Expr>,
    }, //ptr:typeとかのbase:type複雑な型
    Loopif {
        name: String,
        cond: Vec<Expr>,
        body: Vec<Stmt>,
    }, //loopif:name(cond){do}
}
#[derive(Debug, Clone)]
pub struct Stmt {
    pub expr: Expr,
}
#[derive(Debug, Clone)]
pub enum TopLevel {
    Function(Function),
    Struct(Struct),
    Declare(Declare),
}
#[derive(Debug, Clone)]
pub struct Declare {
    pub name: String,
    pub return_type: Expr,
    pub args: Vec<Expr>,
    pub is_vararg: bool,
}
#[derive(Debug, Clone)]
pub struct Function {
    pub name: String,
    pub return_type: Expr,
    pub args: Vec<(Expr, Expr)>, //(type,name)
    pub body: Vec<Stmt>,
}
#[derive(Debug, Clone)]
pub struct Struct {
    pub name: String,
    pub _return_type: Expr,
    pub args: Vec<(Expr, Expr)>, //(type,name)
}

#[derive(Debug, Clone)]
pub struct Program {
    pub functions: Vec<TopLevel>, //functions & structs & toplevel call
    pub has_main: bool,
}
```

### 4.中間言語LLVM IRを生成

```llvm
; ModuleID = 'wapl_module'
source_filename = "wapl_module"

@str_0 = private unnamed_addr constant [14 x i8] c"Hello, world!\00", align 1
@println_fmt_1 = private unnamed_addr constant [4 x i8] c"%s\0A\00", align 1

declare i64 @strtol(ptr, ptr, i32)

declare double @atof(ptr)

declare i32 @printf(ptr, ...)

declare i32 @sprintf(ptr, ptr, ...)

declare ptr @realloc(ptr, i64)

declare ptr @malloc(i64)

declare void @free(ptr)

declare i32 @scanf(ptr, ...)

define i32 @_TOPLEVEL_() {
entry:
  ret i32 0
}

define i32 @main() {
entry:
  %ret_val = alloca i32, align 4
  %calltmp = call i32 @_TOPLEVEL_()
  %printf = call i32 (ptr, ...) @printf(ptr @println_fmt_1, ptr @str_0)
  ret i32 0
}
```

この段階では3.で生成したASTから意味を読み取り,それに合わせてLLVM IRを生成します。WapLではデフォルトでラッパーを用意しているCの関数の宣言をや文字列リテラル、`_TOPLEVEL_`関数などが最初に作られて、その後、実際にWapLで書いたプログラムが書かれます。`main`では、`entry`ブロックを設置、戻り値のためのメモリを一応確保(初期は`return`を書かないでもいいようにする設計だった名残で今はほとんど死んでる)、`_TOPLEVEL_`を呼ぶ、`println`はC言語の`printf`のラッパーなので`printf`を呼ぶ、`0`を返すということが書かれています。

## トークン列の生成

では具体的にどのようにトークン列を生成しているのか見てみましょう。
まずトークンを作る構造体を以下のように定義します。
```rust
pub struct Tokenizer {
    chars: Vec<char>,
    pos: usize,
}

impl Tokenizer{
    pub fn new(input: &str) -> Self {
        Self {
            chars: input.chars().collect(),
            pos: 0,
        }
    }
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).cloned()
    }

    fn next_char(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.pos += 1;
        Some(ch)
    }

    fn match_next(&mut self, expected: char) -> bool {
        if self.peek() == Some(expected) {
            self.pos += 1;
            true
        } else {
            false
        }
    }
}
```
`new`で初期化、`peek`で今いる場所の文字を読み取り、`next_char`で今いる場所の文字を読み取って文字を一つ進める、`match_next`で今いる場所の文字が期待するものと一致すれば進める。というように基本的な動きを定義します。

次に、`impl Tokenizer`に空白とコメントを飛ばすメソッドを追加します。
```rust
fn skip_whitespace(&mut self) {
    while let Some(c) = self.peek() {
        if c.is_whitespace() {
            self.pos += 1;
        } else {
            self.skip_comment();
            break;
        }
    }
}
fn skip_comment(&mut self) {
    loop {
        if self.peek() != Some('/') || self.chars.get(self.pos + 1) != Some(&'/') {
            return;
        }

        self.pos += 2;

        while let Some(c) = self.peek() {
            self.pos += 1;
            if c == '\n' {
                break;
            }
        }

        self.skip_whitespace();
    }
}
```
`skip_whitespace`では文字が空白である限り進め、空白ではなくなったときにコメントがあればそれもスキップするようにしています。`skip_comment`では`//`を見つけてその分の2文字進めて改行が来るまで進め続けて改行が来たら空白をスキップしてまたコメントが来ないか確認するということを繰り返して、コメントじゃないのが来たら終わります。

次に、文字列や文字のリテラルをトークンにするメソッドを`impl Tokenizer`に追加します。ファイルや標準入力などから受け取った文字列は`"\n"`が`"\\n"`になってたりなどするのでそれを書いた通りの形に戻したり、`\x61`や`\u{A66E}`のように文字コードでの入力をできるようにします。
```rust
fn string_and_char_tokenize(&mut self) -> String {
    let mut s = String::new();
    while let Some(c) = self.next_char() {
        if c == '"' || c == '\'' {
            break;
        }
        if c != '\\' {
            s.push(c);
            continue;
        }

        if self.match_next('n') {
            s.push('\n');
        } else if self.match_next('0') {
            s.push('\0');
        } else if self.match_next('\\') {
            s.push('\\');
        } else if self.match_next('r') {
            s.push('\r');
        } else if self.match_next('t') {
            s.push('\t');
        } else if self.match_next('"') {
            s.push('"');
        } else if self.match_next('x') {
            let h1 = self.next_char().unwrap();
            let h2 = self.next_char().unwrap();
            let byte = u8::from_str_radix(&format!("{}{}", h1, h2), 16).unwrap();
            s.push(byte as char);
        } else if self.match_next('u') {
            if self.match_next('{') {
                let mut hex = String::new();

                while let Some(cc) = self.next_char() {
                    if cc == '}' {
                        break;
                    }
                    hex.push(cc);
                }
                let cp = u32::from_str_radix(&hex, 16).unwrap();
                let cch = char::from_u32(cp).unwrap();
                s.push(cch);
            } else {
                s.push('\\');
                s.push('u');
            }
        } else {
            s.push(c);
        }
    }
    s
}
```
見ての通り`'\\'`が来たらその場所を置き換えるようにしています。

最後にこれらのメソッドを使ってトークンを作ってトークン列に追加していくメソッドを追加します。まず空白とコメントをスキップして、次に文字があるかを確かめ、その後、文字列リテラルか->文字リテラルか->数値リテラルか(もしそうだとしたら整数か浮動小数点数かまた何ビットか)->識別子やキーワード->括弧や記号、といった順で確かめていきトークン列に追加するということをしています。
```rust
pub fn next_token(&mut self) -> Token {
    loop {
        self.skip_whitespace();
        self.skip_comment();
        break;
    }

    let ch = match self.next_char() {
        Some(c) => c,
        None => return Token::EOF,
    };

    // ----- String -----
    if ch == '"' {
        return Token::StringLiteral(self.string_and_char_tokenize());
    }
    //----char-----
    if ch == '\'' {
        let c = self.string_and_char_tokenize().chars().collect::<Vec<_>>()[0];
        return Token::CharLiteral(c);
    }

    // ----- Number -----
    if ch.is_ascii_digit() || ch == '-' {
        let mut s = ch.to_string();
        let mut is_float = false;
        let mut is_short = false;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() || c == '.' ||c=='s'{
                if c == '.' {
                    is_float = true;
                }
                if c == 's'{
                    is_short = true;
                    self.pos += 1;
                    break;
                }
                s.push(c);
                self.pos += 1;
            } else {
                break;
            }
        }
        if s != "-" {
            if is_float {
                return if !is_short{Token::FloatNumber(s.parse::<f64>().unwrap())}else{Token::FloatshortNumber(s.parse::<f32>().unwrap())};
            } else {
                return if !is_short{Token::IntNumber(s.parse::<i64>().unwrap())}else{Token::IntshortNumber(s.parse::<i32>().unwrap())};
            }
        }
    }

    // ----- Identifier / Keyword -----
    if !ch.is_ascii_digit()
        && ch != ','
        && ch != ';'
        && ch != '{'
        && ch != '}'
        && ch != '('
        && ch != ')'
        && ch != ':'
    {
        let mut s = ch.to_string();
        while let Some(c) = self.peek() {
            if c != ','
                && c != ';'
                && c != '{'
                && c != '}'
                && c != '('
                && c != ')'
                && c != ' '
                && c != ':'
                && c != '\n'
            {
                s.push(c);
                self.pos += 1;
            } else {
                break;
            }
        }

        return match s.as_str() {
            "fn" => Token::Fn,
            "struct" => Token::Struct,
            "point" => Token::Point,
            "warpto" => Token::Warpto,
            "warptoif" => Token::WarptoIf,
            "true" => Token::BoolLiteral(true),
            "false" => Token::BoolLiteral(false),
            "return" => Token::Return,
            "Array" => Token::ArrayCall,
            "import" | "use" => Token::Import,
            "loopif" => Token::LoopIf,
            "declare" => Token::Declare,
            _ => Token::Ident(s),
        };
    }

    // ----- Operators / Signs -----
    match ch {
        ',' => Token::Comma,
        ';' => Token::Semicolon,
        ':' => Token::Colon,
        '(' => Token::Lsep(LSeparator::LParen),
        ')' => Token::Rsep(RSeparator::RParen),
        '{' => Token::Lsep(LSeparator::LBrace),
        '}' => Token::Rsep(RSeparator::RBrace),
        _ => Token::EOF,
    }
}

pub fn tokenize(&mut self) -> Vec<Token> {
    let mut tokens = Vec::new();

    loop {
        let t = self.next_token();
        if t == Token::EOF {
            break;
        }
        tokens.push(t);
    }

    tokens
}
```

## ASTの生成

まずは、ASTを作る構造体を以下のように定義します。
```rust
pub struct Parser {
    tokens: Vec<Token>,
    pos: usize,
    has_main: bool,
}
impl Parser{
    pub fn new(tokens: Vec<Token>) -> Self {
        Self {
            tokens,
            pos: 0,
            has_main: false,
        }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }
    fn peek_back(&self) -> Option<&Token> {
        self.tokens.get(self.pos - 1)
    }
    fn _peek_front(&self) -> Option<&Token> {
        self.tokens.get(self.pos + 1)
    }
    fn no_return_next(&mut self) {
        self.pos += 1;
    }
    fn no_return_back(&mut self) {
        self.pos -= 1;
    }
    fn next(&mut self) -> Option<&Token> {
        let t = self.tokens.get(self.pos);
        self.pos += 1;
        t
    }

    fn expect(&mut self, expected: &Token) {
        let t = self.next().expect("unexpected EOF");
        if t != expected {
            panic!("expected {:?}, got {:?}", expected, t);
        }
    }
    fn check(&self, expected: &Token) -> bool {
        let t = self.peek().expect("unexpected EOF");
        t == expected
    }

    fn consume_comma(&mut self) {
        match self.peek() {
            Some(Token::Comma) => {
                self.next();
            }
            _ => {}
        }
    }
    fn consume_semicolon(&mut self) {
        match self.peek() {
            Some(Token::Semicolon) => {
                self.next();
            }
            _ => {}
        }
    }
}
```
Tokenizerと同様に`new`で初期化、`peek`で今いるとこのトークンを読み取る、`peek_back`で一つ前を読み取る、`_peek_front`は使ってないが一つ先を読み取るもの、`no_return_back`と`no_return_next`は戻り値なしで次に進めたり一つ戻したりする、`next`で今のを読み取って次に進める、`expect`は期待するトークンと異なればエラーを出す、`check`は期待するトークンと一致するかのboolを返す、`consume_XXX`はXXXを飛ばす。という基本的な動作を定義する。

次に`use`で他のファイルもトークン列を作る->ASTを再帰的に作っていくためのメソッドを追加する。ここではすでにASTを作ったファイルを重複して`use`で呼びだしてしまわないようにASTを作ったらファイル名を記録していき、その記録にまだ登録されてないことを確認してからASTをつくっている。
```rust
fn connect_use(&mut self, import_map: &mut Vec<String>, funcs: &mut Vec<TopLevel>) {
    self.no_return_next();
    let Token::StringLiteral(path) = self.next().unwrap_or(&Token::EOF) else {
        return;
    };
    let source = fs::read_to_string(path).expect("ファイルを読み込めませんでした");
    if import_map.contains(&path) {
        return;
    }
    let mut tokenizer = Tokenizer::new(source.as_str());
    let tokens = tokenizer.tokenize();
    let mut parser = Parser::new(tokens);
    let parsed = parser.parse_program(import_map);
    for module_ast in parsed.functions {
        funcs.push(module_ast);
    }
    import_map.push(path.to_string());
}
```
ではここからパースしてASTを作るところを見てみよう。プログラム全体のパースを駆動するのは以下のメソッドを使う。
```rust
pub fn parse_program(&mut self, import_map: &mut Vec<String>) -> Program {
    let mut funcs = Vec::new();

    while let Some(tok) = self.peek() {
        match tok {
            Token::Import => {
                self.connect_use(import_map, &mut funcs);
            }
            Token::Fn => {
                funcs.push(TopLevel::Function(self.parse_function()));
            }
            Token::Struct => {
                funcs.push(TopLevel::Struct(self.parse_struct()));
            }
            Token::Declare => {
                funcs.push(TopLevel::Declare(self.parse_declare()));
            }
            Token::Semicolon => {
                self.no_return_next();
            }
            _ => {
                // toplevel eval
                let expr = self.parse_expr();
                match expr {
                    Expr::Call { name, args: _ } if name == "main" => {}
                    other => {
                        funcs.push(TopLevel::Function(Function {
                            name: "toplevel_child".to_string(),
                            return_type: Expr::Ident("void".to_string()),
                            args: vec![],
                            body: vec![Stmt { expr:other }],
                        }));
                    }
                }
            }
        }
    }

    Program {
        functions: funcs,
        has_main: self.has_main,
    }
}
```

また、それぞれの文と式を以下のようなメソッドたちを使ってパースする。
```rust
// -------------------------
// Parse function
// fn name():i32 { ... }
// -------------------------
fn parse_function(&mut self) -> Function {
    self.expect(&Token::Fn);

    let mut is_main = false;
    // function name
    let mut name = match self.next() {
        Some(Token::Ident(s)) => s.clone(),
        other => panic!("expected function name, got {:?}", other),
    };
    name = if name == "main" {
        is_main = true;
        self.has_main = true;
        "main".to_string()
    } else {
        name
    };

    // (type name,type name,...)
    self.expect(&Token::Lsep(LSeparator::LParen));
    let mut args = Vec::new();
    while let Some(token_arg_type) = self.peek() {
        if *token_arg_type == Token::Rsep(RSeparator::RParen) {
            break;
        }
        self.no_return_next();
        let arg_type = match self.peek_back() {
            Some(Token::Ident(s)) => self.parse_type_apply(s.clone()),
            other => panic!("expected arg type, got {:?}", other),
        };
        let arg_name = match self.next() {
            Some(Token::Ident(s)) => Expr::Ident(s.clone()),
            other => panic!("expected arg name, got {:?}", other),
        };
        args.push((arg_type, arg_name));
        self.consume_comma();
    }
    self.expect(&Token::Rsep(RSeparator::RParen));
    let mut return_type = Expr::Ident("void".to_string());
    if self.check(&Token::Colon) {
        self.expect(&Token::Colon);
        if !self.check(&Token::Lsep(LSeparator::LBrace)) {
            return_type = self.parse_return_type();
        }
    }
    // { statements }
    self.expect(&Token::Lsep(LSeparator::LBrace));
    self.consume_semicolon();

    let mut stmts = Vec::new();
    if is_main {
        stmts.push(Stmt {
            expr: Expr::Call {
                name: "_TOPLEVEL_".to_string(),
                args: vec![],
            },
        })
    }

    while let Some(tok) = self.peek() {
        if *tok == Token::Rsep(RSeparator::RBrace) {
            break;
        }
        // optional ;
        if let Some(Token::Semicolon) = self.peek() {
            self.next();
        }

        let expr = self.parse_expr();
        stmts.push(Stmt { expr });

        // optional ;
        if let Some(Token::Semicolon) = self.peek() {
            self.next();
        }
    }

    self.expect(&Token::Rsep(RSeparator::RBrace));
    self.consume_semicolon();

    Function {
        name,
        return_type,
        args: args,
        body: stmts,
    }
}
// -------------------------
// Parse struct
// struct name{ i32 a, ptr b,..., }
//
fn parse_struct(&mut self) -> Struct {
    self.expect(&Token::Struct);

    // struct name
    let (name, return_type) = match self.next() {
        Some(Token::Ident(s)) => (s.clone(), Expr::Ident(s.clone())),
        other => panic!("expected struct name, got {:?}", other),
    };
    self.expect(&Token::Lsep(LSeparator::LBrace));
    self.consume_semicolon();
    let mut args = Vec::new();
    while let Some(token_arg_type) = self.peek() {
        if *token_arg_type == Token::Rsep(RSeparator::RBrace) {
            break;
        }
        self.no_return_next();
        let arg_type = match self.peek_back() {
            Some(Token::Ident(s)) => self.parse_type_apply(s.clone()), //Expr::Ident(s.clone()),
            other => panic!("expected arg type, got {:?}", other),
        };
        let arg_name = match self.next() {
            Some(Token::Ident(s)) => Expr::Ident(s.clone()),
            other => panic!("expected arg name, got {:?}", other),
        };
        args.push((arg_type, arg_name));
        self.consume_comma();
    }
    self.expect(&Token::Rsep(RSeparator::RBrace));
    Struct {
        name,
        _return_type: return_type,
        args,
    }
}

fn parse_declare(&mut self) -> Declare {
    self.expect(&Token::Declare);

    // function name
    let mut name = match self.next() {
        Some(Token::Ident(s)) => s.clone(),
        other => panic!("expected function name, got {:?}", other),
    };
    name = if name == "main" {
        "main".to_string()
    } else {
        name
    };

    // (type name,type name,...)
    self.expect(&Token::Lsep(LSeparator::LParen));
    let mut args = Vec::new();
    let mut is_vararg = false;
    while let Some(token_arg_type) = self.peek() {
        if *token_arg_type == Token::Rsep(RSeparator::RParen) {
            break;
        }
        self.no_return_next();
        let arg_type = match self.peek_back() {
            Some(Token::Ident(s)) => self.parse_type_apply(s.clone()),
            other => panic!("expected arg type, got {:?}", other),
        };
        match arg_type {
            Expr::Ident(s) if s == "..." => {
                is_vararg = true;
            }
            _ => {
                args.push(arg_type);
            }
        }
        self.consume_comma();
    }
    self.expect(&Token::Rsep(RSeparator::RParen));
    let mut return_type = Expr::Ident("void".to_string());
    if self.check(&Token::Colon) {
        self.expect(&Token::Colon);
        if !self.check(&Token::Lsep(LSeparator::LBrace)) {
            return_type = self.parse_return_type();
        }
    }
    self.consume_semicolon();

    self.consume_semicolon();

    Declare {
        name,
        return_type,
        args: args,
        is_vararg,
    }
}
// -------------------------
// Parse expression (function-call style)
//
//   +(1,2)
//   =(a, 1, i32)
//   println(a)
//   warpto(label)
//   loopif:name(cond){}
// -------------------------
fn parse_return_type(&mut self) -> Expr {
    self.no_return_next();
    let token = self.peek_back();
    match token {
        Some(Token::Ident(name)) => {
            let front = self.peek();
            match front {
                Some(Token::Colon) => self.parse_type_apply(name.clone()),
                Some(_) => Expr::Ident(name.clone()),
                _ => panic!("unexpected EOF in expression"),
            }
        }
        Some(tok) => panic!(
            "{}expression begins with unexpected token {:?}",
            self.pos, tok
        ),
        None => panic!("unexpected EOF in expression"),
    }
}
fn parse_expr(&mut self) -> Expr {
    self.no_return_next();
    let token = self.peek_back();
    match token {
        Some(Token::IntNumber(n)) => Expr::IntNumber(*n),
        Some(Token::FloatNumber(n)) => Expr::FloatNumber(*n),
        Some(Token::IntshortNumber(n)) => Expr::IntSNumber(*n),
        Some(Token::FloatshortNumber(n)) => Expr::FloatSNumber(*n),
        Some(Token::StringLiteral(s)) => Expr::String(s.clone()),
        Some(Token::CharLiteral(c)) => Expr::Char(*c),
        Some(Token::BoolLiteral(b)) => Expr::Bool(*b),
        Some(Token::Return) => Expr::Return(vec![self.parse_expr()]),
        Some(Token::Point) => Expr::Point(vec![self.parse_expr()]),
        Some(Token::Warpto) => self.parse_call("warpto".to_string()),
        Some(Token::WarptoIf) => self.parse_call("warptoif".to_string()),
        Some(Token::LoopIf) => self.parse_loopif(),
        Some(Token::ArrayCall) => self.parse_call("Array".to_string()),
        Some(Token::Ident(name)) => self.parse_ident_expr(name.clone()),
        Some(tok) => panic!(
            "{}expression begins with unexpected token {:?}",
            self.pos, tok
        ),
        None => panic!("unexpected EOF in expression"),
    }
}
fn parse_ident_expr(&mut self, name: String) -> Expr {
    let front = self.peek();
    match front {
        Some(Token::Lsep(LSeparator::LParen)) => self.parse_call(name.clone()),
        Some(Token::Lsep(LSeparator::LBrace)) => self.parse_structval(name.clone()),
        Some(Token::Colon) => self.parse_type_apply(name.clone()),
        Some(_) => Expr::Ident(name.clone()),
        _ => panic!("unexpected EOF in expression"),
    }
}

// -------------------------
// Function call parsing
//
// name(arg1, arg2, ...)
// -------------------------
fn parse_type_apply(&mut self, name: String) -> Expr {
    match self.next() {
        Some(Token::Colon) => {}
        _ => {
            self.no_return_back();
            return Expr::Ident(name.clone());
        } //normal types
    }
    let mut args = Vec::new();
    match self.peek() {
        _ => {
            let arg = self.parse_return_type();
            args.push(arg);
            self.consume_comma();
        }
    }
    Expr::TypeApply { base: name, args }
}
fn parse_structval(&mut self, name: String) -> Expr {
    match self.next() {
        Some(Token::Lsep(LSeparator::LBrace)) => {}
        other => panic!(
            "expected '{{' after function name {:?}, got {:?}",
            name, other
        ),
    }
    let mut args = Vec::new();

    loop {
        match self.peek() {
            Some(Token::Rsep(RSeparator::RBrace)) => {
                self.next();
                break;
            }
            _ => {
                let arg = self.parse_expr();
                args.push(arg);
                self.consume_comma();
            }
        }
    }
    Expr::StructVal {
        _name: name,
        _args: args,
    }
}
fn parse_call(&mut self, mut name: String) -> Expr {
    match self.next() {
        Some(Token::Lsep(LSeparator::LParen)) => {}
        other => panic!(
            "expected '(' after function name {:?}, got {:?}",
            name, other
        ),
    }

    let mut args = Vec::new();

    loop {
        match self.peek() {
            Some(Token::Rsep(RSeparator::RParen)) => {
                self.next();
                break;
            }
            _ => {
                let arg = self.parse_expr();
                args.push(arg);
                self.consume_comma();
            }
        }
    }
    if name == "warpto" || name == "warptoif" {
        self.consume_semicolon();
        return Expr::Warp { name, args };
    } else if name == "Array" {
        self.consume_semicolon();
        return Expr::ArrayLiteral(args);
    }
    name = if name == "main" {
        "main".to_string()
    } else {
        name
    };
    self.consume_semicolon();
    Expr::Call { name, args }
}
fn parse_loopif(&mut self) -> Expr {
    self.expect(&Token::Colon);

    // loopif name
    let name = match self.next() {
        Some(Token::Ident(s)) => s.clone(),
        _ => {
            self.no_return_back();
            "loop".to_string()
        }
    };

    // (cond)
    match self.next() {
        Some(Token::Lsep(LSeparator::LParen)) => {}
        other => panic!("expected '(' after loopif name {:?}, got {:?}", name, other),
    }

    let mut args = Vec::new();

    loop {
        match self.peek() {
            Some(Token::Rsep(RSeparator::RParen)) => {
                self.next();
                break;
            }
            _ => {
                let arg = self.parse_expr();
                args.push(arg);
                self.consume_comma();
            }
        }
    }

    // { statements }
    self.expect(&Token::Lsep(LSeparator::LBrace));
    self.consume_semicolon();

    let mut stmts = Vec::new();

    while let Some(tok) = self.peek() {
        if *tok == Token::Rsep(RSeparator::RBrace) {
            break;
        }
        // optional ;
        if let Some(Token::Semicolon) = self.peek() {
            self.next();
        }

        let expr = self.parse_expr();
        stmts.push(Stmt { expr });

        // optional ;
        if let Some(Token::Semicolon) = self.peek() {
            self.next();
        }
    }

    self.expect(&Token::Rsep(RSeparator::RBrace));
    self.consume_semicolon();

    Expr::Loopif {
        name,
        cond: args,
        body: stmts,
    }
}
```
見ての通りWapLコンパイラのパーサは再帰下降パーサになっている。
>再帰下降構文解析（さいきかこうこうぶんかいせき、英語: Recursive Descent Parsing）は、相互再帰型の手続き（あるいは再帰的でない同等の手続き）で構成されるLL法のトップダウン構文解析であり、各プロシージャが文法の各生成規則を実装することが多い。従って、生成されるプログラムの構造はほぼ正確にその文法を反映したものとなる。そのような実装の構文解析器を再帰下降パーサ（Recursive Descent Parser）と呼ぶ。　[wikiより](https://ja.wikipedia.org/wiki/%E5%86%8D%E5%B8%B0%E4%B8%8B%E9%99%8D%E6%A7%8B%E6%96%87%E8%A7%A3%E6%9E%90)

## LLVM IRの生成

以下のような構造体を作る。
```rust
pub struct Codegen<'ctx> {
    pub context: &'ctx Context,
    pub module: Module<'ctx>,
    pub builder: Builder<'ctx>,
    pub struct_types: HashMap<String, StructType<'ctx>>,// structの型を名前をキーにして記録
    pub struct_fields: HashMap<String, Vec<(String, BasicTypeEnum<'ctx>, u32, Expr)>>, // structのフィールドの名前とインデックスと型をstructの名前をキーにして記録
    str_counter: usize, // グローバルに確保した文字列の数
    current_fn: Option<FunctionContext<'ctx>>, // 現在コンパイルしている関数とその関数内のpointで作ったラベルやwarptoなどの元ブロック
    pub function_types: HashMap<String, Expr>, // 関数の戻り値の型
    pub current_owners: HashMap<String, bool>, // 現在の関数全体での所有権を持っているポインタが有効かどうかを記録
    pub scope_owners: ScopeOwner, // 現在のスコープで所有権を持ってるポインタが有効かどうかを記録し,リターン時にこれに基づいてメモリリークを検出
}
struct PendingJump<'ctx> {
    from: BasicBlock<'ctx>,
}
#[derive(Clone)]
struct VariablesPointerAndTypes<'ctx> {
    ptr: PointerValue<'ctx>,
    typeexpr: Expr,
}
struct FunctionContext<'ctx> {
    function: FunctionValue<'ctx>,
    labels: HashMap<String, BasicBlock<'ctx>>, //labels(already exist)
    unresolved: HashMap<String, Vec<PendingJump<'ctx>>>, //labels(unresolved)
}
#[derive(Clone)]
pub struct ScopeOwner {
    pos: usize,
    owners: Vec<HashMap<String, bool>>,
}
```
全体のコンパイルを駆動はメソッドがしています
```rust
pub fn compile_program(&mut self, program: Program) {
    if program.has_main {
        self.compile_declare(Declare {
            name: "_TOPLEVEL_".to_string(),
            return_type: Expr::Ident("i32".to_string()),
            args: vec![],
            is_vararg: false,
        });
    }

    for func in program.functions {
        match func {
            TopLevel::Function(f) => {
                self.compile_function(f);
            }
            TopLevel::Struct(s) => {
                self.compile_struct(s);
            }
            TopLevel::Declare(d) => {
                self.compile_declare(d);
            }
        }
    }
    combine_toplevel(&self.module, &self.builder, program.has_main);
}
```
まず最初に`_TOPLEVEL_`の宣言をしてその後,関数か構造体か関数の宣言かのコンパイルを順に呼び出していきます。そして最後にトップレベルにある式を`_TOPLEVEL_`にまとめています。

この本でのWapLコンパイラの作り方の説明は一旦ここまでにしておきます。ソースコードは[https://github.com/kazanefu/WapL_Compiler](https://github.com/kazanefu/WapL_Compiler)で公開されているので興味があれば見てみてください。もし問題点を見つけたり改善をしてくれたら遠慮なく報告していただけるとありがたいです。