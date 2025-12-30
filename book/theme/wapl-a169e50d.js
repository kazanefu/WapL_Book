hljs.registerLanguage("wapl", function(hljs) {
    const IDENT = /[A-Za-z_][A-Za-z0-9_]*/;

    return {
        name: "WapL",

        // 解析対象となるパターンのリスト
        contains: [

            // --------------------------------
            // コメント // ... 
            // --------------------------------
            {
                className: "comment",
                begin: /\/\//,
                end: /$/,
            },

            // --------------------------------
            // ダブルクォート文字列
            // --------------------------------
            {
                className: "string",
                begin: /"/,
                end: /"/,
                contains: [
                    {
                        className: "escape",
                        begin: /\\./
                    }
                ]
            },

            // --------------------------------
            // シングルクォート文字
            // --------------------------------
            {
                className: "string",
                begin: /'/,
                end: /'/
            },

            // --------------------------------
            // キーワード
            // --------------------------------
            {
                className: "keyword",
                begin: /\b(fn|if|loopif|point|warpto|warptoif|return|use|struct|declare|export|elif|else)\b/,
            },

            // --------------------------------
            // 特殊演算子
            // --------------------------------
            {
                className: "built_in",
                begin: /(#=|=|&_|\*_ |pmove|p&|p&mut|true|false)/,
            },

            // --------------------------------
            // 特殊キーワード this, self, break- など
            // --------------------------------
            {
                className: "defvariable",
                begin: /\b(this|super|self|break-|continue-)\b/
            },

            // --------------------------------
            // 数値
            // --------------------------------
            {
                className: "number",
                begin: /\b[0-9]+\b/
            },

            // --------------------------------
            // 関数名 foo(
            // --------------------------------
            {
                className: "function",
                begin: new RegExp(`${IDENT.source}(?=\\()`, "u"),
            },

            // --------------------------------
            // 型定義 ptr:T, *:T, &:T, &mut:T
            // --------------------------------
            {
                className: "type",
                begin: /\b(ptr:|(\*:)|&mut:|&:)[^\s)]+/
            },

            // --------------------------------
            // 組み込み型
            // --------------------------------
            {
                className: "type",
                begin: /\b(i32|isize|i64|f32|f64|bool|char|String|T)\b/
            },

            // --------------------------------
            // 変数
            // --------------------------------
            {
                className: "variable",
                begin: new RegExp(`\\b${IDENT.source}\\b`, "u"),
            },

            // --------------------------------
            // 括弧類
            // --------------------------------
            {
                className: "punctuation",
                begin: /[\[\]\(\)\{\}]/
            }
        ]
    };
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('pre code.language-wapl').forEach((block) => {
        hljs.highlightElement(block);
    });
});