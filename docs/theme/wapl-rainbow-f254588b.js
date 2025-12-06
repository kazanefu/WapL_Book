(function() {
    const COLORS = 7; // 7色ループ

    function colorizeBrackets(element) {
        const text = element.innerHTML;

        let depth = 0;           // 実際の深さ
        const stack = [];        // 色番号のみを積む
        let output = "";

        const openBrackets = "([{";
        const closeBrackets = ")]}";

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (openBrackets.includes(ch)) {
                depth++;
                const colorIndex = (depth - 1) % COLORS + 1; // 色番号
                stack.push(colorIndex);

                output += `<span class="bracket-level-${colorIndex}">${ch}</span>`;
            }
            else if (closeBrackets.includes(ch)) {
                const colorIndex = stack.pop() || 1;
                output += `<span class="bracket-level-${colorIndex}">${ch}</span>`;

                depth--;
            }
            else {
                output += ch;
            }
        }

        element.innerHTML = output;
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("pre code.language-wapl").forEach(colorizeBrackets);
    });
})();
