# Clang/LLVM -21のインストール(Ubuntu系想定)
以下のコマンドを順に打って最後に`clang-21 --version`でバージョンが出力されたら成功です。
```bash
$ sudo apt update
```
```bash
$ sudo apt install -y wget gnupg
```
```bash
$ wget https://apt.llvm.org/llvm.sh
```
```bash
$ chmod +x llvm.sh
```
```bash
$ sudo ./llvm.sh 21
```
```bash
$ clang-21 --version
```