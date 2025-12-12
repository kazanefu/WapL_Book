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

この方法でインストールした場合プロジェクト内のwapl.tomlのclangの欄を`"clang-21"`に書き変えるか以下のようにして`clang`を`clang-21`になるようにしておく必要があるかもしれません
```bash
sudo update-alternatives --install /usr/bin/clang clang /usr/bin/clang-21 100
```