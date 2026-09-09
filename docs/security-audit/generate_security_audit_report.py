from __future__ import annotations

import os
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


PROJECT_NAME = "Caderno de Estudos"
REPORT_PATH = Path(__file__).with_name("relatorio-auditoria-seguranca.pdf")

SEVERITY_COLORS = {
    "crítica": colors.HexColor("#B91C1C"),
    "alta": colors.HexColor("#EA580C"),
    "média": colors.HexColor("#D97706"),
    "baixa": colors.HexColor("#2563EB"),
    "ponto forte": colors.HexColor("#059669"),
}

FINDINGS = [
    {
        "severity": "alta",
        "category": "Banco sem tranca",
        "file": "src/App.jsx:250-304",
        "description": "O app escreve diretamente em caminhos Firestore baseados em user.uid, mas não há regras de segurança no repositório/stack para isolar por usuário/tenant. Em Firebase, esse isolamento é feito em Firestore Security Rules; não existe arquivo de regras nem validação de propriedade em backend.",
    },
    {
        "severity": "alta",
        "category": "Inputs sem tratamento",
        "file": "src/App.jsx:944-1065",
        "description": "O editor ContentEditable persiste HTML bruto em Firestore e o re-renderiza sem sanitização. Como não há lib de sanitização e o conteúdo é interpretado como HTML, há risco de stored XSS via tags/script em notas.",
    },
]

SEVERITY_COUNTS = {
    "crítica": 0,
    "alta": 2,
    "média": 0,
    "baixa": 0,
    "ponto forte": 0,
}

CATEGORY_COUNTS = {
    "Banco sem tranca": 1,
    "Permissão no navegador": 0,
    "IDOR": 0,
    "Chaves expostas": 0,
    "Inputs sem tratamento": 1,
}

METHODOLOGY = (
    "A auditoria mapeou as categorias às APIs e aos mecanismos reais da stack detectada: "
    "Vite + React + Firebase JS SDK (Firestore + Auth), sem backend próprio, sem ORM, sem Docker/Helm/Terraform e sem regras de armazenamento no repositório. "
    "Assim, a categoria de isolamento foi interpretada como Firestore Security Rules; a de permissão e IDOR foi avaliada como não aplicável a um backend de rotas inexistente; "
    "a de chaves expostas foi avaliada em variáveis client-side e configuração pública do Firebase; e a categoria de XSS foi verificada nos fluxos de edição de notas do frontend."
)

ISSUES = [
    """
--- ISSUE 1 ---
[Segurança] Falta de isolamento e regras de acesso no Firestore
Labels sugeridas: security + alta

Descrição do problema: A aplicação salva dados usando caminhos do tipo artifacts/<appId>/users/<user.uid>/notebooks/... diretamente no cliente. Em Firebase, esse isolamento só é garantido por Firestore Security Rules. Neste repositório não há regras de segurança, nem backend, o que torna a propriedade dos objetos dependente apenas do código front-end e do console do Firebase.

Por que é explorável: Qualquer cliente autenticado, ou um ator que altere identificadores no front-end, pode escrever em caminhos que o código constrói com user.uid e activeNotebookId, sem uma checagem autoritativa no servidor. O código não valida no lado do servidor que o documento pertence ao usuário autenticado.

Evidência: Arquivo: src/App.jsx:250-304; Trecho: await setDoc(doc(db, "artifacts", appId, "users", user.uid, "notebooks", activeNotebookId), updatedNotebook);
Arquivo: src/config/firebase.js:5-16; Trecho: export const db = getFirestore(app);

Impacto: Compromete o isolamento entre usuários e pode permitir leitura, escrita ou exclusão de dados de outros inquilinos/cuentas quando regras de Firestore não estiverem corretamente configuradas.

Sugestão de correção: Definir Firestore Security Rules rigorosas com validação de request.auth.uid, resource.data.ownerUid e/ou tenant; rejeitar qualquer escrita fora do namespace do usuário autenticado; mover lógica sensível para Cloud Functions se necessário.

Critérios de aceite: Existe firestore.rules versionado; toda escrita verifica request.auth.uid e o dono do documento; testes de segurança validam que um usuário não consegue escrever em outro user.uid.
--- FIM ISSUE 1 ---
""",
    """
--- ISSUE 2 ---
[Segurança] Stored XSS em notas via ContentEditable sem sanitização
Labels sugeridas: security + alta

Descrição do problema: O campo de edição de notas usa react-contenteditable com html={note.content || ""} e o conteúdo bruto é persistido em autoSaveNoteContent(note.id, e.target.value). Não existe sanitização antes do armazenamento nem antes do render; o HTML está sendo aceito e reemitido como DOM.

Por que é explorável: Um usuário malicioso pode salvar nota contendo, por exemplo, <img src=x onerror=alert(1)> ou outra marcação HTML ativa. Quando a nota é renderizada, a página executará o script/HTML no cliente do navegador do usuário autenticado.

Evidência: Arquivo: src/App.jsx:944-1065; Trecho: ContentEditable html={note.content || ""} onChange={(e) => { autoSaveNoteContent(note.id, e.target.value); }}
Arquivo: src/App.jsx:908-929; Trecho: ContentEditable innerRef={contentEditableRef} html={noteForm.content} onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}

Impacto: Stored XSS pode roubar sessão, manipular UI, persistir ações maliciosas e impactar outros usuários que abram as anotações.

Sugestão de correção: Sanitizar todo HTML antes de salvar com DOMPurify ou equivalente; persistir texto simples em vez de HTML bruto quando possível; usar editor com sanitização obrigatória.

Critérios de aceite: O HTML das notas é sanitizado antes do armazenamento; a renderização usa HTML limpo e validado; testes cobrem payloads como <script>, onerror e javascript:.
--- FIM ISSUE 2 ---
""",
]


def severity_to_hex(sev: str) -> str:
    return SEVERITY_COLORS.get(sev.lower(), colors.HexColor("#2563EB"))


def make_donut_chart(path: Path, counts: dict[str, int]):
    labels = ["Crítica", "Alta", "Média", "Baixa"]
    values = [counts.get("crítica", 0), counts.get("alta", 0), counts.get("média", 0), counts.get("baixa", 0)]
    colors_list = ["#B91C1C", "#EA580C", "#D97706", "#2563EB"]

    fig, ax = plt.subplots(figsize=(4.6, 4.6))
    wedges, texts, autotexts = ax.pie(
        values,
        labels=labels,
        autopct="%1.0f",
        startangle=90,
        colors=colors_list,
        wedgeprops={"width": 0.6},
        textprops={"fontsize": 9, "color": "#0f172a"},
    )
    ax.set_title("Distribuição por severidade", fontsize=12, color="#0f172a")
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def make_bar_chart(path: Path, categories: dict[str, int]):
    labels = list(categories.keys())
    values = [categories[k] for k in labels]
    colors_list = [
        "#B91C1C",
        "#EA580C",
        "#D97706",
        "#2563EB",
        "#059669",
    ]

    fig, ax = plt.subplots(figsize=(7.5, 3.2))
    bars = ax.bar(labels, values, color=colors_list[: len(labels)])
    ax.set_title("Achados por categoria", fontsize=12, color="#0f172a")
    ax.set_ylabel("Quantidade")
    ax.set_ylim(0, max(1, max(values)) + 1)
    ax.grid(axis="y", linestyle="--", alpha=0.25)
    for bar, value in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, value + 0.05, str(value), ha="center", va="bottom", fontsize=8)
    plt.xticks(rotation=20, ha="right")
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def build_issue_block(issue_text: str):
    safe_text = issue_text.replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe_text, ParagraphStyle(name="IssueBlock", fontName="Helvetica", fontSize=8, leading=11, spaceAfter=12, borderPadding=6, backColor=colors.Color(0.97, 0.97, 0.98), borderColor=colors.HexColor("#cbd5e1"), borderWidth=0.6))


def build_table_of_findings():
    data = [["Severidade", "Arquivo:linha", "Descrição"]]
    for finding in FINDINGS:
        sev = finding["severity"].capitalize()
        data.append([
            Paragraph(f"<font color=\"white\" backColor=\"{severity_to_hex(finding['severity'])}\"><b>{sev}</b></font>", ParagraphStyle(name="SeverityChip", fontName="Helvetica", fontSize=8, alignment=1)),
            finding["file"],
            finding["description"],
        ])
    table = Table(data, colWidths=[23 * mm, 35 * mm, 104 * mm])
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    return table


def build_summary_table():
    rows = [["Severidade", "Quantidade"], ["Crítica", SEVERITY_COUNTS["crítica"]], ["Alta", SEVERITY_COUNTS["alta"]], ["Média", SEVERITY_COUNTS["média"]], ["Baixa", SEVERITY_COUNTS["baixa"]]]
    table = Table(rows, colWidths=[60 * mm, 35 * mm])
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ])
    )
    return table


def generate_pdf():
    output_path = REPORT_PATH
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        textColor=colors.HexColor("#0f172a"),
        leading=24,
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        "H2Style",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        textColor=colors.HexColor("#111827"),
        spaceBefore=20,
        spaceAfter=10,
    )
    normal_style = ParagraphStyle(
        "NormalAlt",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        spaceAfter=8,
    )
    strong = ParagraphStyle(
        "Strong",
        parent=normal_style,
        fontName="Helvetica-Bold",
    )

    story = []
    story.append(Paragraph(f"Relatório de Auditoria de Segurança — {PROJECT_NAME}", title_style))
    story.append(Paragraph("Data: 09/09/2026", normal_style))
    story.append(Paragraph("Escopo auditado: Vite + React + Firebase JS SDK (Firestore/Auth), sem backend, sem ORM, sem Docker/Helm/Terraform no repositório.", normal_style))
    story.append(Paragraph("Nota metodológica: a auditoria mapou cada categoria à stack detectada; a categoria de isolamento foi tratada como Firestore Security Rules, as de permissão/IDOR foram avaliadas no contexto de ausência de backend e as de XSS foram verificadas nos fluxos do frontend.", normal_style))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Resumo executivo", h2_style))
    story.append(build_summary_table())
    story.append(Spacer(1, 6 * mm))

    donut_path = Path(__file__).with_name("severity_donut.png")
    bar_path = Path(__file__).with_name("category_bar.png")
    make_donut_chart(donut_path, SEVERITY_COUNTS)
    make_bar_chart(bar_path, CATEGORY_COUNTS)
    story.append(Image(str(donut_path), width=95 * mm, height=70 * mm))
    story.append(Spacer(1, 5 * mm))
    story.append(Image(str(bar_path), width=150 * mm, height=70 * mm))
    story.append(PageBreak())

    story.append(Paragraph("Pontos fortes", h2_style))
    story.append(Paragraph("• O código usa Firebase Auth e identifica usuário por `user.uid` em operações de escrita e leitura; isso sinaliza uma lógica de identidade clara e um desenho de dados por usuário, mesmo sem regras no repositório.", normal_style))
    story.append(Paragraph("• O projeto não contém segredos embutidos em arquivos de código rastreados; as credenciais de Firebase presentes em .env.local são chaves Web públicas, não segredos de servidor.", normal_style))
    story.append(Paragraph("• A aplicação não expõe bibliotecas de sanitização inadequadas e não há uso de eval/new Function no código auditado.", normal_style))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("Pontos fracos", h2_style))
    story.append(Paragraph("• Falta de Firestore Security Rules e de validação server-side no modelo de dados; tudo é escrito no cliente. Isso torna o isolamento de inquilinos dependente da configuração externa do Firebase e pode ser quebrado sem controle no código.", normal_style))
    story.append(Paragraph("• A edição de notas aceita HTML bruto em `ContentEditable`, sem sanitização. Isso configura risco de stored XSS e pode ser explorado por qualquer usuário que consiga inserir conteúdo malicioso em anotações.", normal_style))
    story.append(PageBreak())

    story.append(Paragraph("Tabela de achados detalhados por categoria", h2_style))
    story.append(build_table_of_findings())
    story.append(PageBreak())

    story.append(Paragraph("Recomendações priorizadas", h2_style))
    recommendations = [
        "P1 — Remover armazenamento de HTML bruto em notas e aplicar sanitização DOMPurify antes de persistir e renderizar.",
        "P1 — Definir e versionar Firestore Security Rules com validação de owner/tenant e evitar acesso sem autenticação.",
        "P2 — Adicionar camada de backend ou Cloud Functions para qualquer ação sensível, em vez de confiar em dados do cliente.",
        "P3 — Separar configuração pública do Firebase (VITE_*) da configuração sensível e validar startup de variáveis necessárias.",
    ]
    for idx, rec in enumerate(recommendations, start=1):
        story.append(Paragraph(f"{idx}. {rec}", normal_style))

    story.append(PageBreak())
    story.append(Paragraph("ISSUES PARA O GITHUB", h2_style))
    for issue in ISSUES:
        story.append(build_issue_block(issue))

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )

    def page_setup(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#475569"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(20 * mm, 12 * mm, f"Relatório de Auditoria de Segurança — {PROJECT_NAME}")
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"Página {doc.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=page_setup, onLaterPages=page_setup)

    for file_path in [donut_path, bar_path]:
        if file_path.exists():
            file_path.unlink()


def main():
    generate_pdf()
    print(f"PDF gerado em: {REPORT_PATH}")


if __name__ == "__main__":
    main()
