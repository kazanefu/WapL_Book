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

では次は関数のIRを作るところを見てみましょう
```rust
fn compile_function(&mut self, func: Function) {
    if self.function_types.contains_key(&func.name) {
        panic!("function '{}' already defined", func.name);
    }
    // --- type of return value ---
    let return_type_is_void = matches!(func.return_type, Expr::Ident(ref s) if s == "void");

    let return_type_enum = if return_type_is_void {
        None
    } else {
        Some(self.llvm_type_from_expr(&func.return_type))
    };

    // --- type of arguments ---
    let arg_types: Vec<BasicTypeEnum> = func
        .args
        .iter()
        .map(|(ty, _)| self.llvm_type_from_expr(ty))
        .collect();

    // ---convert to Metadata type ---
    let arg_types_meta: Vec<BasicMetadataTypeEnum> =
        arg_types.iter().map(|t| (*t).into()).collect();

    // --- LLVM gen function ---
    let fn_type = if return_type_is_void {
        self.context.void_type().fn_type(&arg_types_meta, false)
    } else {
        return_type_enum.unwrap().fn_type(&arg_types_meta, false)
    };

    // --- add function ---
    let llvm_func = self.module.add_function(&func.name, fn_type, None);
    self.function_types
        .insert(func.name.clone(), func.return_type);
    let entry = self.context.append_basic_block(llvm_func, "entry");
    self.builder.position_at_end(entry);

    // --- alloca & initialize args ---
    self.current_owners = HashMap::new();
    self.scope_owners = ScopeOwner::new();
    let mut variables: HashMap<String, VariablesPointerAndTypes<'ctx>> = HashMap::new();
    for (i, (ty, arg_expr)) in func.args.iter().enumerate() {
        let param = llvm_func.get_nth_param(i as u32).unwrap();

        // get arg names (Expr::Ident(name))
        let arg_name = match arg_expr {
            Expr::Ident(name) => name.as_str(),
            _ => panic!("Function argument name must be identifier"),
        };
        param.set_name(arg_name);

        // alloca anyway
        let alloca = self
            .builder
            .build_alloca(param.get_type(), arg_name)
            .expect("alloca failed");
        self.builder.build_store(alloca, param).unwrap();
        variables.insert(
            arg_name.to_string(),
            VariablesPointerAndTypes {
                ptr: alloca,
                typeexpr: ty.clone(),
            },
        );
        match ty {
            Expr::TypeApply { base, args: _args } if base == "*" => {
                self.current_owners.insert(arg_name.to_string(), true);
                self.scope_owners.set_true(arg_name.to_string());
            }
            _ => {}
        }
    }
    //alloca return value
    let _ret_alloca = if !return_type_is_void {
        Some(
            self.builder
                .build_alloca(return_type_enum.unwrap(), "ret_val"),
        )
    } else {
        None
    };

    self.current_fn = Some(FunctionContext {
        function: llvm_func,
        labels: HashMap::new(),
        unresolved: HashMap::new(),
    });

    // --- function body ---
    for stmt in func.body {
        let _value = self.compile_stmt(&stmt, &mut variables);
    }

    // --- temporary return ---
    if return_type_is_void {
        self.builder.build_return(None).unwrap();
    } else {
        // // 仮に i32 を戻り値として返す
        // let zero = self.context.i32_type().const_int(0, false);
        // self.builder.build_return(Some(&zero)).unwrap();
    }
    //Exit from the current function
    self.current_fn = None;
}
```
まず、関数がすでに定義されていないかの確認をします。次にASTの戻り値の型をLLVM IRの型に変換します。また、同様にして引数の型もIRの型にします。そしたら、関数の宣言をして記録します。次にスコープと所有権を持つポインタを管理するものを作って、引数をそのスコープ内の変数として読み取れるようにしていきます。その後、関数の本体のコンパイルを文ごとに連続して呼びます。

ではそれぞれの文をコンパイルするメソッドを見ていきましょう。ここでは主に制御フローと戻り値のIRを生成します。まず式が来た場合は式のIRを作るためのメソッドを呼んで任せます。次に、`point ラベル名` `warpto(行先)` `warptoif(条件,真のときの行先,偽のときの行先)` `return 戻り値` `loopif:ループ名(条件){...}`のそれぞれを分岐してIRにしていっています。`Return`のところに注目するとここで所有権を持っているポインタが所有しているメモリが解放されているかを確認してメモリリークを防いでいます。
```rust
fn compile_stmt(
    &mut self,
    stmt: &Stmt,
    variables: &mut HashMap<String, VariablesPointerAndTypes<'ctx>>,
) {
    match &stmt.expr {
        Expr::IntNumber(_) | Expr::FloatNumber(_) | Expr::Call { .. } | Expr::Ident(_) => {
            // compile_expr
            self.compile_expr(&stmt.expr, variables);
        }
        Expr::Point(labels) => {
            let label_name = match &labels[0] {
                Expr::Ident(s) => Some(s.as_str()),
                _ => None,
            };
            self.gen_point(label_name.expect("point: missing label literal"));
        }
        Expr::Warp { name, args } => match name.as_str() {
            "warpto" => {
                //get label name (point NAME <- this)
                let label_name = match &args[0] {
                    Expr::Ident(s) => Some(s.as_str()),
                    _ => None,
                };
                self.gen_warpto(label_name.expect("point: missing label literal"));
            }
            "warptoif" => {
                // compile condition value
                let cond: BasicValueEnum = self.compile_expr(&args[0], variables).unwrap().0;
                let cond_i1 = match cond {
                    BasicValueEnum::IntValue(v) if v.get_type().get_bit_width() == 1 => v,
                    _ => panic!("warptoif condition requires boolean (i1) values"),
                };
                //get label name (point NAME <- this)
                // label_name1 = destination if condition true
                // label_name2 = destination if condition false (optional)
                let label_name1 = match &args[1] {
                    Expr::Ident(s) => Some(s.as_str()),
                    _ => None,
                };
                let label_name2 = match &args.get(2) {
                    Some(Expr::Ident(s)) => Some(s.as_str()),
                    _ => None,
                };
                self.gen_warptoif(
                    cond_i1,
                    label_name1.expect("point: missing label literal"),
                    label_name2,
                );
            }
            _ => {
                panic!("warp:not (warpto or warptoif)");
            }
        },
        Expr::Return(vals) => {
            if vals.len() != 1 {
                panic!("Return must have exactly one value");
            }
            //compile return value
            let ret_val = self
                .compile_expr(vals.into_iter().next().unwrap(), variables)
                .unwrap()
                .0; // unwrap is safe because we already checked vals.len() == 1
            self.builder.build_return(Some(&ret_val)).unwrap();
            // check memory leak
            for i in self.scope_owners.show_current() {
                // if there are Not released memory , print error message
                if let Some(b) = self.current_owners.get(&i.0)
                    && *b
                {
                    println!(
                        "{}:you need to free or drop pointer {}!",
                        "Error".red().bold(),
                        i.0
                    );
                }
            }
            self.scope_owners.reset_current();
        }
        Expr::Loopif { name, cond, body } => {
            if cond.len() != 1 {
                panic!("Loopif:{} conditions must have exactly one value", name);
            }

            self.compile_loopif(name, &cond[0], body, variables);
        }
        _ => unimplemented!(),
    }
}
```
次は式をIRに落とし込むところを見てみましょう。以下のメソッドではリテラル、変数、コンパイラ組み込みの関数の呼び出し、ユーザー定義の関数の呼び出しをIRにしています。すべてのコンパイラ組み込みの関数について書いてあったりするため非常に長くなっていますので全体の流れだけつかめればよいでしょう。
```rust
fn compile_expr(
    &mut self,
    expr: &Expr,
    variables: &mut HashMap<String, VariablesPointerAndTypes<'ctx>>,
) -> Option<(
    BasicValueEnum<'ctx>,
    Expr,
    Option<VariablesPointerAndTypes<'ctx>>,
)> {
    match expr {
        // Literals
        Expr::IntNumber(n) => Some((
            self.context.i64_type().const_int(*n as u64, false).into(),
            Expr::Ident("i64".to_string()),
            None,
        )),
        Expr::FloatNumber(n) => Some((
            self.context.f64_type().const_float(*n).into(),
            Expr::Ident("f64".to_string()),
            None,
        )),
        Expr::IntSNumber(n) => Some((
            self.context.i32_type().const_int(*n as u64, false).into(),
            Expr::Ident("i32".to_string()),
            None,
        )),
        Expr::FloatSNumber(n) => Some((
            self.context.f32_type().const_float((*n).into()).into(),
            Expr::Ident("f32".to_string()),
            None,
        )),
        Expr::Bool(b) => Some((
            self.context.bool_type().const_int(*b as u64, false).into(),
            Expr::Ident("bool".to_string()),
            None,
        )),
        Expr::Char(c) => Some((
            self.context.i8_type().const_int(*c as u64, false).into(),
            Expr::Ident("char".to_string()),
            None,
        )),
        Expr::String(s) => {
            //create unique named global string
            let global_str = self
                .builder
                .build_global_string_ptr(s, &format!("str_{}", self.str_counter))
                .unwrap();
            self.str_counter += 1;
            Some((
                global_str.as_pointer_value().into(),
                Expr::TypeApply {
                    base: "ptr".to_string(),
                    args: vec![Expr::Ident("char".to_string())],
                },
                None,
            ))
        }

        // Variables
        Expr::Ident(name) => {
            //get pointer and variable type
            let alloca = variables
                .get(name)
                .expect(&format!("Undefined variable {}", name)); // safe because variable must exist
            match &alloca.typeexpr {
                //borrow check
                Expr::TypeApply { base, args } if base == "*" => {
                    // check ownership: if pointer has been moved, reading it is prohibited
                    if !self.current_owners.get(name).expect(&format!(
                        "{} type is *:{:?} but failed to find in ownerships ",
                        name, args[0]
                    )) {
                        println!(
                            "{}:\"{}\" already moved. it is prohibited to read moved pointer",
                            "Error".red().bold(),
                            name
                        )
                    }
                }
                _ => {}
            }
            Some((
                self.builder
                    .build_load(self.llvm_type_from_expr(&alloca.typeexpr), alloca.ptr, name)
                    .unwrap()
                    .into(),
                alloca.typeexpr.clone(),
                Some(alloca.clone()),
            ))
        }

        Expr::Call { name, args } => match name.as_str() {
            //return reference
            "ptr" | "&_" => {
                //if arg is variable , name is variable name
                //else get pointer by from compile_expr
                let name = match &args[0] {
                    Expr::Ident(s) => s,
                    _ => {
                        //unwrap because "ptr" or "&_" require an expression with a pointer
                        let (_exp, ty, p) = self.compile_expr(&args[0], variables).unwrap();
                        let ptr = p
                            .expect(&format!(
                                "ptr() and &_ require an expression with a pointer"
                            ))
                            .ptr
                            .as_basic_value_enum();
                        return Some((
                            ptr.clone(),
                            Expr::TypeApply {
                                base: "ptr".to_string(),
                                args: vec![ty],
                            },
                            None,
                        ));
                    }
                };
                let alloca = get_var_alloca(variables, name);
                Some((
                    alloca.as_basic_value_enum(),
                    Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![
                            variables
                                .get(name)
                                .expect(&format!("Undefined variable {}", name))
                                .typeexpr
                                .clone(),
                        ],
                    },
                    None,
                ))
            }
            //dereference
            //val(pointer , option(what type to load it as))
            "val" | "*_" => {
                //p = (pointer value,type,...)
                // safe: "val" / "*_" always expects an expression that evaluates to a pointer
                let p = self.compile_expr(&args[0], variables).unwrap();
                let ptr = p.0.into_pointer_value();
                let mut load_type = &expr_deref(&p.1); // what type the pointer point
                let ty = args.get(1);
                // Determine the type to load: default is pointer's base type, override if second argument is provided
                load_type = match ty {
                    Some(t) => t,
                    None => load_type,
                };
                let loaded = self
                    .builder
                    .build_load(self.llvm_type_from_expr(load_type), ptr, "deref")
                    .unwrap();
                Some((loaded.as_basic_value_enum(), load_type.clone(), None))
            }
            //declaring and initializing variables
            "let" | "#=" => {
                // args: [var_name, initial_value, type_name]
                let var_name = match &args[0] {
                    Expr::Ident(s) => s,
                    _ => panic!("let: first arg must be variable name"),
                };

                let llvm_type: BasicTypeEnum = self.llvm_type_from_expr(&args[2]);

                // If there is an initial value
                let init_val_exist = match &args[1] {
                    Expr::Ident(s) => {
                        if *s == "_".to_string() {
                            false
                        } else {
                            true
                        }
                    }
                    _ => true,
                };
                // Check if an initial value is provided; "_" means no initial value
                // If no initial value, zero-initialize (works for numeric types and structs)
                let init_val = if init_val_exist {
                    self.compile_expr(&args[1], variables)
                } else {
                    // For structs, initialize with zeroed
                    Some((
                        llvm_type.const_zero(),
                        Expr::Ident("void".to_string()),
                        None,
                    ))
                };

                // alloca
                let alloca = self
                    .builder
                    .build_alloca(llvm_type, var_name)
                    .expect("fail alloca");
                self.builder
                    .build_store(alloca, init_val.clone().unwrap().0) // safe unwrap: the existence of init_val is already checked
                    .unwrap();
                variables.insert(
                    var_name.clone(),
                    VariablesPointerAndTypes {
                        ptr: alloca,
                        typeexpr: args[2].clone(),
                    },
                );
                // if its type is pointer with Ownership, recoad ownership scope and the entire function ownership
                match &args[2] {
                    Expr::TypeApply { base, args } if base == "*" => {
                        self.current_owners.insert(var_name.clone(), true);
                        self.scope_owners.set_true(var_name.clone());
                        if !init_val_exist {
                            println!(
                                "{}: {var_name} is Owner (*:{:?}). it must have value",
                                "Error".red().bold(),
                                args
                            )
                        }
                    }
                    Expr::TypeApply { base:_, args:_ } =>{}
                    _ => if init_val_exist&&!type_match(&args[2], &init_val.clone().unwrap().1) {
                        println!("{}: {var_name} Type miss match : expected {:?} found {:?}","Error".red().bold(),&args[2],&init_val.clone().unwrap().1)
                    },
                }

                Some((init_val.unwrap().0, Expr::Ident("void".to_string()), None))
            }
            // Assignment
            "=" => match &args[1] {
                // Array assign is special
                Expr::ArrayLiteral(elems) => Some((
                    self.codegen_array_assign(&args[0], elems, variables)
                        .unwrap(), // safe unwrap: codegen_array_assign returns Some for valid array literals
                    Expr::Ident("void".to_string()),
                    None, // Array assignment does not return a value because the pointer already exists
                )),
                _ => {
                    let value = self.compile_expr(&args[1], variables).unwrap();
                    let alloca = self.get_pointer_expr(&args[0], variables);
                    // reassign *_(immutable borrow) or val(immutable borrow) is prohibited
                    // Check for immutable borrow: cannot reassign *_(immutable) or val(immutable)
                    if let Expr::Call { name: _name, args } = &args[0]
                        && let Some(Expr::Ident(s)) = args.get(0)
                        && let Some(val) = variables.get(s)
                        && let Expr::TypeApply { base, args: _args } = &val.typeexpr
                        && base == "&"
                    {
                        println!(
                            "{} :{} :{:?} is immutable borrow! if you want to reassign, use &mut:T",
                            "Error".red().bold(),
                            s,
                            &val.typeexpr
                        );
                    }
                    self.builder.build_store(alloca, value.0).unwrap();
                    Some(value)
                }
            },
            // add,sub,mul,div,rem
            "+" | "-" | "*" | "/" | "%" => {
                let lhs_val = self.compile_expr(&args[0], variables)?;
                let rhs_val = self.compile_expr(&args[1], variables)?;

                // ===== Type matching: Match the right side to the type of the left side =====
                let rhs_casted = match (lhs_val.0, rhs_val.0) {
                    // ------- When both the left and right are integers -------
                    (BasicValueEnum::IntValue(l), BasicValueEnum::IntValue(r)) => {
                        let lhs_bits = l.get_type().get_bit_width();
                        let rhs_bits = r.get_type().get_bit_width();

                        let r2 = if lhs_bits > rhs_bits {
                            // i32 → i64
                            self.builder
                                .build_int_s_extend(r, l.get_type(), "int_ext")
                                .unwrap()
                        } else if lhs_bits < rhs_bits {
                            // i64 → i32
                            self.builder
                                .build_int_cast(r, l.get_type(), "int_trunc")
                                .unwrap()
                        } else {
                            r
                        };
                        BasicValueEnum::IntValue(r2)
                    }

                    // ------- When both the left and right are floating point -------
                    (BasicValueEnum::FloatValue(l), BasicValueEnum::FloatValue(r)) => {
                        let lhs_ty = l.get_type();
                        let rhs_ty = r.get_type();

                        let r2 = if lhs_ty != rhs_ty {
                            let lhs_bits = float_bit_width(lhs_ty);
                            let rhs_bits = float_bit_width(rhs_ty);

                            if lhs_bits > rhs_bits {
                                // f32 → f64
                                self.builder.build_float_ext(r, lhs_ty, "fext").unwrap()
                            } else {
                                // f64 → f32
                                self.builder.build_float_trunc(r, lhs_ty, "ftrunc").unwrap()
                            }
                        } else {
                            r
                        };

                        BasicValueEnum::FloatValue(r2)
                    }

                    // ------- int + float → float (left is float)-------
                    (BasicValueEnum::FloatValue(l), BasicValueEnum::IntValue(r)) => {
                        let r2 = self
                            .builder
                            .build_signed_int_to_float(r, l.get_type(), "i2f")
                            .unwrap();
                        BasicValueEnum::FloatValue(r2)
                    }

                    // ------- int + float → int (left is int)-------
                    (BasicValueEnum::IntValue(l), BasicValueEnum::FloatValue(r)) => {
                        let r2 = self
                            .builder
                            .build_float_to_signed_int(r, l.get_type(), "f2i")
                            .unwrap();
                        BasicValueEnum::IntValue(r2)
                    }

                    _ => panic!("Unsupported combination in binary operation"),
                };

                // ===== Calculation from here =====
                // Perform the arithmetic operation: operands are now type-matched (int or float)
                let result = match (lhs_val.0, rhs_casted) {
                    (BasicValueEnum::IntValue(l), BasicValueEnum::IntValue(r)) => {
                        let v = match name.as_str() {
                            "+" => self.builder.build_int_add(l, r, "add").unwrap(),
                            "-" => self.builder.build_int_sub(l, r, "sub").unwrap(),
                            "*" => self.builder.build_int_mul(l, r, "mul").unwrap(),
                            "/" => self.builder.build_int_signed_div(l, r, "div").unwrap(),
                            "%" => self.builder.build_int_signed_rem(l, r, "rem").unwrap(),
                            _ => unreachable!(),
                        };
                        v.as_basic_value_enum()
                    }

                    (BasicValueEnum::FloatValue(l), BasicValueEnum::FloatValue(r)) => {
                        let v = match name.as_str() {
                            "+" => self.builder.build_float_add(l, r, "fadd").unwrap(),
                            "-" => self.builder.build_float_sub(l, r, "fsub").unwrap(),
                            "*" => self.builder.build_float_mul(l, r, "fmul").unwrap(),
                            "/" => self.builder.build_float_div(l, r, "fdiv").unwrap(),
                            "%" => self.builder.build_float_rem(l, r, "frem").unwrap(),
                            _ => unreachable!(),
                        };
                        v.as_basic_value_enum()
                    }

                    _ => unreachable!(),
                };

                Some((result, lhs_val.1, None))
            }
            // float Special Functions
            "sqrt" | "cos" | "sin" | "pow" | "exp" | "log" => {
                let compiled_args: Vec<BasicValueEnum> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap().0;
                        val
                    })
                    .collect();
                // check first argument
                let val_l = match compiled_args[0] {
                    BasicValueEnum::FloatValue(v) => v,
                    // unwrap is safe here because only float arguments are allowed for these intrinsics
                    _ => panic!("{} require f values", name.as_str()),
                };
                // If the function takes a second argument (e.g., pow), ensure it is a float
                let val_r = if compiled_args.len() > 1 {
                    match compiled_args[1] {
                        BasicValueEnum::FloatValue(v) => Some(v),
                        // unwrap is safe here because only float arguments are allowed for these intrinsics
                        _ => panic!("at {} expected float", name.as_str()),
                    }
                } else {
                    None
                };
                match name.as_str() {
                    "sqrt" => Some((
                        self.call_intrinsic("llvm.sqrt.f64", val_l, val_r),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    "cos" => Some((
                        self.call_intrinsic("llvm.cos.f64", val_l, val_r),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    "sin" => Some((
                        self.call_intrinsic("llvm.sin.f64", val_l, val_r),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    "pow" => Some((
                        self.call_intrinsic("llvm.pow.f64", val_l, val_r),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    "exp" => Some((
                        self.call_intrinsic("llvm.exp.f64", val_l, val_r),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    "log" => Some((
                        self.call_intrinsic("llvm.log.f64", val_l, val_r),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    _ => None,
                }
            }
            // Compile binary comparison operations. Returns boolean i1 value.
            "==" | "!=" | "<=" | ">=" | "<" | ">" => {
                let compiled_args: Vec<BasicValueEnum> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap().0;
                        val
                    })
                    .collect();
                let v = match name.as_str() {
                    "==" => Some(
                        self.build_eq(compiled_args[0], compiled_args[1])
                            .as_basic_value_enum(),
                    ),
                    "!=" => Some(
                        self.build_neq(compiled_args[0], compiled_args[1])
                            .as_basic_value_enum(),
                    ),
                    "<" => Some(
                        self.build_lt(compiled_args[0], compiled_args[1])
                            .as_basic_value_enum(),
                    ),
                    ">" => Some(
                        self.build_gt(compiled_args[0], compiled_args[1])
                            .as_basic_value_enum(),
                    ),
                    "<=" => Some(
                        self.build_le(compiled_args[0], compiled_args[1])
                            .as_basic_value_enum(),
                    ),
                    ">=" => Some(
                        self.build_ge(compiled_args[0], compiled_args[1])
                            .as_basic_value_enum(),
                    ),
                    _ => None,
                };
                Some((
                    v.expect("Unsupported comparison operator"),
                    Expr::Ident("bool".to_string()),
                    None,
                ))
            }
            // Bitwise Operations
            //and,or,xor,left shift,right shift(sign extend is true),right shift(sign extend is false)
            "&" | "|" | "^" | "<<" | ">>" | "l>>" => {
                let compiled_args: Vec<(
                    BasicValueEnum,
                    Expr,
                    Option<VariablesPointerAndTypes>,
                )> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap();
                        val
                    })
                    .collect();
                let val_l = match compiled_args[0].0 {
                    BasicValueEnum::IntValue(v) => v,
                    _ => panic!("{} require i values", name.as_str()),
                };
                let val_r = match compiled_args[1].0 {
                    BasicValueEnum::IntValue(v) => v,
                    _ => panic!("{} require i values", name.as_str()),
                };
                // compiled_args[0].clone().1 is type of first argument
                // return type is type of  first argument
                match name.as_str() {
                    "&" => Some((
                        self.builder
                            .build_and(val_l, val_r, "and_tmp")
                            .unwrap()
                            .as_basic_value_enum(),
                        compiled_args[0].clone().1,
                        None,
                    )),
                    "|" => Some((
                        self.builder
                            .build_or(val_l, val_r, "or_tmp")
                            .unwrap()
                            .as_basic_value_enum(),
                        compiled_args[0].clone().1,
                        None,
                    )),
                    "^" => Some((
                        self.builder
                            .build_xor(val_l, val_r, "xor_tmp")
                            .unwrap()
                            .as_basic_value_enum(),
                        compiled_args[0].clone().1,
                        None,
                    )),
                    "<<" => Some((
                        self.builder
                            .build_left_shift(val_l, val_r, "<<_tmp")
                            .unwrap()
                            .as_basic_value_enum(),
                        compiled_args[0].clone().1,
                        None,
                    )),
                    ">>" => Some((
                        self.builder
                            .build_right_shift(val_l, val_r, true, ">>_tmp")
                            .unwrap()
                            .as_basic_value_enum(),
                        compiled_args[0].clone().1,
                        None,
                    )),
                    "l>>" => Some((
                        self.builder
                            .build_right_shift(val_l, val_r, false, "l>>_tmp")
                            .unwrap()
                            .as_basic_value_enum(),
                        compiled_args[0].clone().1,
                        None,
                    )),
                    _ => panic!("Unsupported bitwise operator: {}", name),
                }
            }
            // Bool Operations
            // && = and, || = or
            "&&" | "||" | "and" | "or" => {
                let compiled_args: Vec<(
                    BasicValueEnum,
                    Expr,
                    Option<VariablesPointerAndTypes>,
                )> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap();
                        val
                    })
                    .collect();
                let lhs_i1 = match compiled_args[0].0 {
                    BasicValueEnum::IntValue(v) if v.get_type().get_bit_width() == 1 => v,
                    _ => panic!("{} require bool values", name.as_str()),
                };
                let rhs_i1 = match compiled_args[1].0 {
                    BasicValueEnum::IntValue(v) if v.get_type().get_bit_width() == 1 => v,
                    _ => panic!("{} require bool values", name.as_str()),
                };
                let v = match name.as_str() {
                    "&&" | "and" => Some(
                        self.builder
                            .build_and(lhs_i1, rhs_i1, "and")
                            .unwrap()
                            .as_basic_value_enum(),
                    ),
                    "||" | "or" => Some(
                        self.builder
                            .build_or(lhs_i1, rhs_i1, "or")
                            .unwrap()
                            .as_basic_value_enum(),
                    ),
                    _ => None,
                };
                Some((v.unwrap(), Expr::Ident("bool".to_string()), None))
            }
            // Bit Reverse
            "!" | "not" => {
                let compiled_args: Vec<(BasicValueEnum, Expr, Option<_>)> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap();
                        val
                    })
                    .collect();
                let val_i1 = match compiled_args[0].0 {
                    BasicValueEnum::IntValue(v) => v,
                    _ => panic!("{} require int or bool values", name.as_str()),
                };
                Some((
                    self.builder
                        .build_not(val_i1, "not_tmp")
                        .unwrap()
                        .as_basic_value_enum(),
                    compiled_args[0].clone().1,
                    None,
                ))
            }
            // Cast to numeric types
            // char, i32/i64, f32/f64 -> cast to i64 or f64
            // String -> parsed to i64 or f64
            "as_i64" | "as_f64" => {
                let compiled_args: Vec<(BasicValueEnum, Expr, Option<_>)> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self
                            .compile_expr(arg, variables)
                            .expect("argument must have value");
                        val
                    })
                    .collect();

                match name.as_str() {
                    "as_i64" => Some((
                        self.build_cast_to_i64(compiled_args[0].0)
                            .as_basic_value_enum(),
                        Expr::Ident("i64".to_string()),
                        None,
                    )),
                    "as_f64" => Some((
                        self.build_cast_to_f64(compiled_args[0].0)
                            .as_basic_value_enum(),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    _ => None,
                }
            }
            // Deprecated names for backward compatibility
            // They behave the same as "as_i64" | "as_f64"
            // Kept to allow older code to continue working
            "parse_i64" | "parse_f64" => {
                let compiled_args: Vec<(BasicValueEnum, Expr, Option<_>)> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap();
                        val
                    })
                    .collect();
                match name.as_str() {
                    "parse_i64" => Some((
                        self.build_cast_to_i64(compiled_args[0].0)
                            .as_basic_value_enum(),
                        Expr::Ident("i64".to_string()),
                        None,
                    )),
                    "parse_f64" => Some((
                        self.build_cast_to_f64(compiled_args[0].0)
                            .as_basic_value_enum(),
                        Expr::Ident("f64".to_string()),
                        None,
                    )),
                    _ => None,
                }
            }
            // Pure if expression: if(cond, then_val, else_val)
            // Both 'then_val' and 'else_val' are always evaluated.
            // Avoid side effects in either branch.
            "if" => {
                let compiled_args: Vec<(BasicValueEnum, Expr, Option<_>)> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap();
                        val
                    })
                    .collect();
                Some((
                    self.build_if_expr(
                        compiled_args[0].0,
                        compiled_args[1].0,
                        compiled_args[2].0,
                        "if",
                    ),
                    compiled_args[1].clone().1,
                    None,
                ))
            }
            // Print with newline
            "println" => {
                let s_val = self.compile_expr(&args[0], variables).unwrap();
                let str_ptr = match s_val.0 {
                    BasicValueEnum::PointerValue(p) => p,
                    _ => panic!("println expects string pointer"),
                };
                self.build_println_from_ptr(str_ptr);
                None
            }
            // Print without newline
            "print" => {
                let s_val = self.compile_expr(&args[0], variables).unwrap();
                let str_ptr = match s_val.0 {
                    BasicValueEnum::PointerValue(p) => p,
                    _ => panic!("print expects string pointer"),
                };
                self.build_print_from_ptr(str_ptr);
                None
            }
            // Wrapper of sprintf
            "format" => {
                // string pointer
                let fmt_val = self.compile_expr(&args[0], variables).unwrap();

                let fmt_ptr = match fmt_val.0 {
                    BasicValueEnum::PointerValue(p) => p,
                    _ => panic!("format expects string pointer"),
                };
                // Remaining arguments: values to format
                let arg_vals: Vec<_> = args[1..]
                    .iter()
                    .map(|a| self.compile_expr(a, variables).unwrap().0)
                    .collect();
                // Returns a string pointer containing the formatted string
                let res_ptr = self.build_format_from_ptr(fmt_ptr, &arg_vals);
                Some((
                    res_ptr.into(),
                    Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![Expr::Ident("char".to_string())],
                    },
                    None,
                ))
            }
            // Pointer addition in 1-byte units (like void* + n)
            "ptr_add_byte" => {
                // args: [ptr, idx] or [idx, ptr]
                let val_l = self.compile_expr(&args[0], variables).unwrap();
                let val_r = self.compile_expr(&args[1], variables).unwrap();

                let (ptr_val, idx_int) = match (val_l.0, val_r.0) {
                    (BasicValueEnum::PointerValue(p), BasicValueEnum::IntValue(i)) => {
                        (p, self.int_to_i64(i))
                    }
                    (BasicValueEnum::IntValue(i), BasicValueEnum::PointerValue(p)) => {
                        (p, self.int_to_i64(i))
                    }
                    _ => panic!("ptr_add expects (ptr, int) or (int, ptr)"),
                };
                // GEP using i8 as element type => 1 byte unit
                let gep = unsafe {
                    self.builder
                        .build_gep(
                            self.llvm_type_from_expr(&Expr::Ident("T".to_string())), // 1byte
                            ptr_val,
                            &[idx_int],
                            "ptr_add_byte",
                        )
                        .unwrap()
                };
                // return as ptr:T (like void*)
                // borrow checker doesn't check "ptr" type pointer
                Some((
                    gep.as_basic_value_enum(),
                    Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![Expr::Ident("T".to_string())],
                    },
                    None,
                ))
            }
            // Pointer addition in units of the pointed-to type
            // Returns the same pointer type as the left operand
            "ptr_add" => {
                // args: [ptr, idx] or [idx, ptr]
                let val_l = self.compile_expr(&args[0], variables).unwrap();
                let val_r = self.compile_expr(&args[1], variables).unwrap();

                let (ptr_val, idx_int) = match (val_l.0, val_r.0) {
                    (BasicValueEnum::PointerValue(p), BasicValueEnum::IntValue(i)) => {
                        (p, self.int_to_i64(i))
                    }
                    (BasicValueEnum::IntValue(i), BasicValueEnum::PointerValue(p)) => {
                        (p, self.int_to_i64(i))
                    }
                    _ => panic!("ptr_add expects (ptr, int) or (int, ptr)"),
                };
                // GEP using the type pointed by left operand => adds in units of that type
                let gep = unsafe {
                    self.builder
                        .build_gep(
                            self.llvm_type_from_expr(&expr_deref(&val_l.1)),
                            ptr_val,
                            &[idx_int],
                            "ptr_add",
                        )
                        .unwrap()
                };

                Some((gep.as_basic_value_enum(), val_l.1, None))
            }
            // for backward compatibility
            // non-multidimensional version of []
            "index" => {
                // args: [ptr, idx] or [idx, ptr] -> load *(ptr + idx)
                let a = self.compile_expr(&args[0], variables).unwrap();
                let b = self.compile_expr(&args[1], variables).unwrap();
                let (ptr_val, idx_int) = match (a.0, b.0) {
                    (BasicValueEnum::PointerValue(p), BasicValueEnum::IntValue(i)) => {
                        (p, self.int_to_i64(i))
                    }
                    (BasicValueEnum::IntValue(i), BasicValueEnum::PointerValue(p)) => {
                        (p, self.int_to_i64(i))
                    }
                    _ => panic!("index expects (ptr,int) or (int,ptr)"),
                };

                let gep = unsafe {
                    self.builder
                        .build_gep(
                            self.llvm_type_from_expr(&expr_deref(&a.1)),
                            ptr_val,
                            &[idx_int],
                            "idx_ptr",
                        )
                        .unwrap()
                };
                let loaded = self
                    .builder
                    .build_load(self.llvm_type_from_expr(&expr_deref(&a.1)), gep, "idx_load")
                    .unwrap();
                Some((
                    loaded.as_basic_value_enum(),
                    expr_deref(&a.1),
                    Some(VariablesPointerAndTypes {
                        ptr: gep,
                        typeexpr: expr_deref(&a.1),
                    }),
                ))
            }
            // index access
            // [](arr , e1 ,e2 ,...) = arr[e1][e2]...
            "[]" => {
                let depth = args.len(); // number of indices + 1 (for array pointer)
                let arr_pointer = self.compile_expr(&args[0], variables).unwrap();
                let ptr_val = match arr_pointer.0 {
                    BasicValueEnum::PointerValue(p) => p,
                    _ => panic!("[] expect ptr,i64,i64,... found {:?}", arr_pointer.1),
                };

                let mut last_ptr = ptr_val;
                let mut typeexp = arr_pointer.1;
                for i in 1..depth {
                    let (val, ty, _p) = self.compile_expr(&args[i], variables).unwrap();
                    let idx_int = match val {
                        BasicValueEnum::IntValue(i_val) => self.int_to_i64(i_val),
                        _ => panic!("[] expect ptr,i64,i64,... found {:?}", ty),
                    };
                    let gep = unsafe {
                        self.builder
                            .build_gep(
                                self.llvm_type_from_expr(&expr_deref(&typeexp)),
                                last_ptr,
                                &[idx_int],
                                "idx_ptr",
                            )
                            .unwrap()
                    };
                    if i == depth - 1 {
                        last_ptr = gep;
                        break;
                    }
                    last_ptr = self
                        .builder
                        .build_load(
                            self.llvm_type_from_expr(&expr_deref(&typeexp)),
                            gep,
                            "idx_load",
                        )
                        .unwrap()
                        .into_pointer_value();
                    typeexp = expr_deref(&typeexp);
                }
                typeexp = expr_deref(&typeexp);
                let loaded = self
                    .builder
                    .build_load(self.llvm_type_from_expr(&typeexp), last_ptr, "idx[]_load")
                    .unwrap();
                Some((
                    loaded.as_basic_value_enum(),
                    typeexp.clone(),
                    Some(VariablesPointerAndTypes {
                        ptr: last_ptr,
                        typeexpr: typeexp.clone(),
                    }),
                ))
            }
            // Allocate memory on the stack
            "alloc_array" | "alloc" => {
                // args: [type_name, length_expr]

                // type of elements
                let elem_ty = self.llvm_type_from_expr(&args[0]);

                // capacity = IntValue
                let len_val = self.compile_expr(&args[1], variables).unwrap();
                let len_val = match len_val.0 {
                    BasicValueEnum::IntValue(i) => i,
                    _ => panic!("alloc_array: length must be integer"),
                };

                // elem_ty must be IntType , FloatType or PointerType = bool,char,i32,i64,T,f64,f32,ptr,&,&mut,*

                let array_ptr = self
                    .builder
                    .build_array_alloca(elem_ty, len_val, "array")
                    .unwrap();

                // let array_ptr = match elem_ty {
                //     BasicTypeEnum::IntType(t) => self
                //         .builder
                //         .build_array_alloca(t, len_val, "array")
                //         .unwrap(),
                //     BasicTypeEnum::FloatType(t) => self
                //         .builder
                //         .build_array_alloca(t, len_val, "array")
                //         .unwrap(),
                //     BasicTypeEnum::PointerType(t) => self
                //         .builder
                //         .build_array_alloca(t, len_val, "array")
                //         .unwrap(),
                //     _ => panic!("alloc_array: unsupported type"),
                // };
                // Return as ptr:elem_ty
                Some((
                    array_ptr.as_basic_value_enum(),
                    Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![args[0].clone()],
                    },
                    None,
                ))
            }
            "free" => {
                self.compile_free(&args[0], variables);
                None
            }
            // Transfer ownership of *:T variable
            "pmove" => {
                let (val, ty, ptr) = self.compile_expr(&args[0], variables).unwrap();
                match &ty {
                    // Expect variable identifier
                    Expr::TypeApply { base, args: _ } if base == "*" => {
                        if let Expr::Ident(var_name) = &args[0] {
                            // Check if variable has already been moved
                            if let Some(owned) = self.current_owners.get_mut(var_name) {
                                if !*owned {
                                    println!(
                                        "{} : at pmove \"{}\" already moved",
                                        "Error".red().bold(),
                                        var_name
                                    );
                                }
                                *owned = false;
                            }
                            if let Some(owned) = self.scope_owners.owners[self.scope_owners.pos]
                                .get_mut(var_name)
                            {
                                *owned = false;
                            }
                        }
                    }
                    Expr::TypeApply { base, args: _args } if base == "&" || base == "&mut" => {
                        println!(
                            "{} pmove expect *:T variables found {:?}",
                            "Error".red().bold(),
                            &ty
                        );
                    }
                    _ => {
                        println!(
                            "{} pmove expect *:T variables found {:?}",
                            "Error".red().bold(),
                            &args[0]
                        );
                    }
                }
                Some((val, ty, ptr))
            }
            // immutable borrow
            "p&" => {
                let (val, ty, ptr) = self.compile_expr(&args[0], variables).unwrap();
                Some((
                    val,
                    Expr::TypeApply {
                        base: "&".to_string(),
                        args: vec![expr_deref(&ty)],
                    },
                    ptr,
                ))
            }
            // mutable borrow
            "p&mut" => {
                let (val, ty, ptr) = self.compile_expr(&args[0], variables).unwrap();
                match &ty {
                    Expr::TypeApply { base, args: _args } if base == "&" => {
                        println!(
                            "{}: p&mut expect &mut:T or *:T found {:?} {:?}",
                            "Error".red().bold(),
                            ty,
                            &args[0]
                        )
                    }
                    _ => {}
                }
                Some((
                    val,
                    Expr::TypeApply {
                        base: "&mut".to_string(),
                        args: vec![expr_deref(&ty)],
                    },
                    ptr,
                ))
            }
            // malloc(size,elements_type)
            // malloc require pointed type for type safety
            // this is safety wrapper of C malloc
            "malloc" => {
                let compiled_size = self.compile_expr(&args[0], variables).unwrap();
                let size = match compiled_size.0 {
                    BasicValueEnum::IntValue(i) => Some(i),
                    _ => panic!("malloc expects integer size"),
                };
                let ele_type = self.llvm_type_from_expr(&args[1]);
                // return ptr:elements_type
                Some((
                    self.compile_malloc(size.unwrap(), ele_type)
                        .as_basic_value_enum(),
                    Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![args[1].clone()],
                    },
                    None,
                ))
            }
            // realloc(ptr ,size,elements_type)
            // realloc require pointed type for type safety
            // this is safety wrapper of C realloc
            "realloc" => {
                let ptr = match self.compile_expr(&args[0], variables).unwrap().0 {
                    BasicValueEnum::PointerValue(p) => p,
                    _ => panic!("realloc expects (ptr,size,type)"),
                };
                let compiled_size = self.compile_expr(&args[1], variables).unwrap();
                let size = match compiled_size.0 {
                    BasicValueEnum::IntValue(i) => Some(i),
                    _ => panic!("realloc expects (ptr,size,type)"),
                };
                let ele_type = self.llvm_type_from_expr(&args[2]);
                // return ptr:elements_type
                Some((
                    self.compile_realloc(ptr, size.unwrap(), ele_type)
                        .as_basic_value_enum(),
                    Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![args[2].clone()],
                    },
                    None,
                ))
            }
            // memcpy(dest,src,size)
            "memcpy" => {
                let dest_ptr = self.compile_expr(&args[0], variables).unwrap();
                let src_ptr = self.compile_expr(&args[1], variables).unwrap();
                let size = self.compile_expr(&args[2], variables).unwrap();
                let (dest_i8, src_i8, size_int) = match (dest_ptr.0, src_ptr.0, size.0) {
                    (
                        BasicValueEnum::PointerValue(d),
                        BasicValueEnum::PointerValue(s),
                        BasicValueEnum::IntValue(i),
                    ) => (
                        self.builder
                            .build_pointer_cast(
                                d,
                                self.context.ptr_type(AddressSpace::default()),
                                "dest8",
                            )
                            .unwrap(),
                        self.builder
                            .build_pointer_cast(
                                s,
                                self.context.ptr_type(AddressSpace::default()),
                                "dest8",
                            )
                            .unwrap(),
                        i,
                    ),
                    _ => panic!(
                        "memcpy expects (ptr,ptr,int) found {:?},{:?},{:?}",
                        dest_ptr.1, src_ptr.1, size.1
                    ),
                };
                self.builder
                    .build_memcpy(dest_i8, 1, src_i8, 1, size_int)
                    .unwrap();

                None
            }
            // memmove(dest,src,size)
            "memmove" => {
                let dest_ptr = self.compile_expr(&args[0], variables).unwrap();
                let src_ptr = self.compile_expr(&args[1], variables).unwrap();
                let size = self.compile_expr(&args[2], variables).unwrap();
                let (dest_i8, src_i8, size_int) = match (dest_ptr.0, src_ptr.0, size.0) {
                    (
                        BasicValueEnum::PointerValue(d),
                        BasicValueEnum::PointerValue(s),
                        BasicValueEnum::IntValue(i),
                    ) => (
                        self.builder
                            .build_pointer_cast(
                                d,
                                self.context.ptr_type(AddressSpace::default()),
                                "dest8",
                            )
                            .unwrap(),
                        self.builder
                            .build_pointer_cast(
                                s,
                                self.context.ptr_type(AddressSpace::default()),
                                "dest8",
                            )
                            .unwrap(),
                        i,
                    ),
                    _ => panic!(
                        "memmove expects (ptr,ptr,int)found {:?},{:?},{:?}",
                        dest_ptr.1, src_ptr.1, size.1
                    ),
                };
                self.builder
                    .build_memmove(dest_i8, 1, src_i8, 1, size_int)
                    .unwrap();

                None
            }
            // memmove(dest,value,size)
            "memset" => {
                let dest_ptr = self.compile_expr(&args[0], variables).unwrap();
                let src_val = self.compile_expr(&args[1], variables).unwrap();
                let size = self.compile_expr(&args[2], variables).unwrap();
                let (dest_i8, value, size_int) = match (dest_ptr.0, src_val.0, size.0) {
                    (
                        BasicValueEnum::PointerValue(d),
                        BasicValueEnum::IntValue(v),
                        BasicValueEnum::IntValue(s),
                    ) => (
                        self.builder
                            .build_pointer_cast(
                                d,
                                self.context.ptr_type(AddressSpace::default()),
                                "dest8",
                            )
                            .unwrap(),
                        v,
                        s,
                    ),
                    _ => panic!("memset expects (ptr,val,int)"),
                };
                let value_i8 = self
                    .builder
                    .build_int_truncate(value, self.context.i8_type(), "val8")
                    .unwrap();
                self.builder
                    .build_memset(dest_i8, 1, value_i8, size_int)
                    .unwrap();

                None
            }
            //return type size in byte as i64
            "sizeof" => Some((
                self.compile_sizeof(&args[0]),
                Expr::Ident("i64".to_string()),
                None,
            )),
            // === struct member access ===
            // "_>": struct pointer -> member value (dereference pointer, then load member)
            // ".": struct value -> member value (use alloca of struct value, then load member)
            // "->": struct pointer -> member pointer (get pointer to member, do not load)
            // struct member access
            // struct pointer -> member value
            "_>" => {
                let value_struct = self.compile_expr(&args[0], variables).unwrap();
                let (memberptr, membertype) =
                    self.compile_member_access(value_struct.0, &args[1], &value_struct.1);
                let member_value = self
                    .builder
                    .build_load(
                        self.llvm_type_from_expr(&expr_deref(&membertype)),
                        memberptr,
                        "getmembervalue",
                    )
                    .unwrap();
                Some((
                    member_value.into(),
                    expr_deref(&membertype),
                    Some(VariablesPointerAndTypes {
                        ptr: memberptr,
                        typeexpr: expr_deref(&membertype),
                    }),
                ))
            }
            // struct member access
            // struct value -> member value
            "." => {
                let value_struct = self.compile_expr(&args[0], variables).unwrap();
                let alloca = value_struct.2.unwrap().ptr;
                let (memberptr, membertype) = self.compile_member_access(
                    alloca.as_basic_value_enum(),
                    &args[1],
                    &Expr::TypeApply {
                        base: "ptr".to_string(),
                        args: vec![value_struct.1],
                    },
                );
                let member_value = self
                    .builder
                    .build_load(
                        self.llvm_type_from_expr(&expr_deref(&membertype)),
                        memberptr,
                        "getmembervalue",
                    )
                    .unwrap();
                Some((
                    member_value.into(),
                    expr_deref(&membertype),
                    Some(VariablesPointerAndTypes {
                        ptr: memberptr,
                        typeexpr: expr_deref(&membertype),
                    }),
                ))
            }
            // struct member access
            // struct pointer -> member pointer
            "->" => {
                let value_struct = self.compile_expr(&args[0], variables).unwrap();
                let (memberptr, membertype) =
                    self.compile_member_access(value_struct.0, &args[1], &value_struct.1);
                Some((memberptr.as_basic_value_enum().into(), membertype, None))
            }
            // wrapper of C scanf
            "scanf" => {
                let fmt_val = self.compile_expr(&args[0], variables).unwrap();
                // Remaining arguments: values to format
                let fmt_ptr = match fmt_val.0 {
                    BasicValueEnum::PointerValue(p) => p,
                    _ => panic!("scanf expects string pointer"),
                };
                let arg_vals: Vec<_> = args[1..]
                    .iter()
                    .map(|a| self.compile_expr(a, variables).unwrap().0)
                    .collect();
                self.build_scan_from_ptr(fmt_ptr, &arg_vals);
                None
            }
            // cast to generic pointer
            "to_anyptr" => {
                // to_anyptr(ptr)
                let ptr = self.compile_expr(&args[0], variables);
                match ptr.unwrap().0 {
                    BasicValueEnum::PointerValue(p) => Some((
                        self.compile_to_anyptr(p, variables).as_basic_value_enum(),
                        Expr::TypeApply {
                            base: "ptr".to_string(),
                            args: vec![Expr::Ident("T".to_string())],
                        },
                        None,
                    )),
                    _ => None,
                }
            }
            // cast from generic pointer
            "from_anyptr" => {
                // from_anyptr(ptr,pointed type)
                let ptr = self.compile_expr(&args[0], variables);
                let target_type = self.llvm_type_from_expr(&args[1]);
                match (ptr.unwrap().0, target_type) {
                    (BasicValueEnum::PointerValue(p), BasicTypeEnum::PointerType(target)) => {
                        Some((
                            self.compile_from_anyptr(p, target).as_basic_value_enum(),
                            Expr::TypeApply {
                                base: "ptr".to_string(),
                                args: vec![args[1].clone()],
                            },
                            None,
                        ))
                    }
                    _ => None,
                }
            }
            // Call other functions
            name => {
                // Lookup LLVM function by name.
                let func = self
                    .module
                    .get_function(&name)
                    .expect(&format!("Function {} not found", name));
                // Compile each argument and convert to BasicMetadataValueEnum,
                // which is required by build_call.
                let compiled_args: Vec<BasicMetadataValueEnum> = args
                    .into_iter()
                    .map(|arg| {
                        let val = self.compile_expr(arg, variables).unwrap();
                        BasicMetadataValueEnum::from(val.0)
                    })
                    .collect();
                // Emit LLVM call instruction
                let call_site = self
                    .builder
                    .build_call(func, &compiled_args, "calltmp")
                    .unwrap();
                // If the function has a return value, extract it.
                if func.get_type().get_return_type().is_some() {
                    Some((
                        call_site.try_as_basic_value().basic().unwrap(),
                        // return type is stored in function_types map (AST-level type)
                        self.function_types
                            .get(name)
                            .expect(&format!("not defined function {}", name))
                            .clone(),
                        None,
                    ))
                } else {
                    None // return is void
                }
            }
        },

        _ => None,
    }
}
```


お疲れ様です。この本でのWapLコンパイラの作り方の説明は一旦ここまでにしておきます。ソースコードは[https://github.com/kazanefu/WapL_Compiler](https://github.com/kazanefu/WapL_Compiler)で公開されているので興味があれば見てみてください。もし問題点を見つけたり改善をしてくれたら遠慮なく報告していただけるとありがたいです。