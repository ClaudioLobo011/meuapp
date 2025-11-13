import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import React, { useEffect, useState } from "react";
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { ProdutoCatalogo, STORAGE_CATALOGO } from "@/constants/catalogo";

// ---- Tipos de layout ---------------------------------------------------------
export type ImportLayout = "COD_CODBARRAS_NOME" | "CODBARRAS_NOME" | "COD_NOME";
export type ExportLayout = "COD_CODBARRAS_NOME_QTD" | "CODBARRAS_NOME_QTD" | "COD_NOME_QTD";

// ---- Chaves de storage -------------------------------------------------------
const K_IMPORT = "cfg/importLayout";
const K_EXPORT = "cfg/exportLayout";
const K_READER = "cfg/externalReader";

export default function Configuracoes() {
  const [importLayout, setImportLayout] = useState<ImportLayout>("COD_CODBARRAS_NOME");
  const [exportLayout, setExportLayout] = useState<ExportLayout>("COD_CODBARRAS_NOME_QTD");
  const [externalReader, setExternalReader] = useState(false);
  const [ultimoImport, setUltimoImport] = useState<{ nome?: string; qtd: number } | null>(null);

  // carregar config salva
  useEffect(() => {
    (async () => {
      const [imp, exp, rdr] = await Promise.all([
        AsyncStorage.getItem(K_IMPORT),
        AsyncStorage.getItem(K_EXPORT),
        AsyncStorage.getItem(K_READER),
      ]);
      if (imp) setImportLayout(imp as ImportLayout);
      if (exp) setExportLayout(exp as ExportLayout);
      if (rdr) setExternalReader(rdr === "1");
    })();
  }, []);

  // salvar mudanças
  useEffect(() => {
    AsyncStorage.setItem(K_IMPORT, importLayout).catch(() => {});
  }, [importLayout]);
  useEffect(() => {
    AsyncStorage.setItem(K_EXPORT, exportLayout).catch(() => {});
  }, [exportLayout]);
  useEffect(() => {
    AsyncStorage.setItem(K_READER, externalReader ? "1" : "0").catch(() => {});
  }, [externalReader]);

  // Importar .txt de acordo com o layout selecionado
  async function importarProdutos() {
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: "text/plain",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pick.canceled || !pick.assets?.[0]) return;

      const file = pick.assets[0];
      const uri = file.uri;

      const txt = await readAsStringAsync(uri, { encoding: "utf8" });

      // quebra linhas e remove vazias
      const linhas = txt
        .split(new RegExp('(?:\\r\\n|\\r|\\n)'))
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const parsed: ProdutoCatalogo[] = [];

      const extensaoValida = file.name?.toLowerCase().endsWith(".txt") ?? true;
      if (!extensaoValida && file.mimeType !== "text/plain") {
        Alert.alert("Arquivo inválido", "Selecione um arquivo .txt conforme o layout escolhido.");
        return;
      }

      for (const raw of linhas) {
        const cols = raw.split(/[;,|	]/).map((c) => c.trim()); // ; , | ou TAB
        // pula cabeçalho se detectar palavras-chave
        const rawUpper = raw.toUpperCase();
        if (rawUpper.includes("NOME") && (rawUpper.includes("COD") || rawUpper.includes("CODBARRAS"))) {
          continue;
        }

        if (importLayout === "COD_CODBARRAS_NOME") {
          if (cols.length < 3) continue;
          const [cod, codbarras, nome] = cols;
          if (!codbarras || !nome) continue;
          parsed.push({ cod, codbarras, nome });
        } else if (importLayout === "CODBARRAS_NOME") {
          if (cols.length < 2) continue;
          const [codbarras, nome] = cols;
          if (!codbarras || !nome) continue;
          parsed.push({ codbarras, nome });
        } else if (importLayout === "COD_NOME") {
          if (cols.length < 2) continue;
          const [cod, nome] = cols;
          if (!cod || !nome) continue;
          parsed.push({ cod, codbarras: cod, nome });
        }
      }

      if (parsed.length === 0) {
        Alert.alert("Nenhum produto lido", "Verifique o layout selecionado e o conteúdo do arquivo informado.");
        return;
      }

      await AsyncStorage.setItem(STORAGE_CATALOGO, JSON.stringify(parsed));
      setUltimoImport({ nome: file.name, qtd: parsed.length });
      Alert.alert("Importação concluída", `Arquivo: ${file.name}
Produtos lidos: ${parsed.length}`);
    } catch (e: any) {
      Alert.alert("Falha na importação", String(e?.message ?? e));
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>LobosTi Contagem — Configurações</Text>
      </View>

      {/* Conteúdo rolável */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* Layout de Importação */}
        <Section title="Layout de Importação">
          <RadioGroupImport
            value={importLayout}
            onChange={setImportLayout}
            options={[
              { value: "COD_CODBARRAS_NOME", label: "COD, CODBARRAS, NOME" },
              { value: "CODBARRAS_NOME", label: "CODBARRAS, NOME" },
              { value: "COD_NOME", label: "COD, NOME" },
            ]}
          />
        </Section>

        {/* Layout de Exportação */}
        <Section title="Layout de Exportação">
          <RadioGroupExport
            value={exportLayout}
            onChange={setExportLayout}
            options={[
              { value: "COD_CODBARRAS_NOME_QTD", label: "COD, CODBARRAS, NOME, QTD" },
              { value: "CODBARRAS_NOME_QTD", label: "CODBARRAS, NOME, QTD" },
              { value: "COD_NOME_QTD", label: "COD, NOME, QTD" },
            ]}
          />
        </Section>

        {/* Modo Leitor Externo */}
        <Section title="Modo Leitor Externo">
          <View style={s.rowBetween}>
            <Text style={s.toggleLabel}>Ativar Modo Leitor Externo</Text>
            <Switch
              value={externalReader}
              onValueChange={setExternalReader}
              trackColor={{ false: "#c7c7c7", true: "#19b37a" }}
              thumbColor="#ffffff"
            />
          </View>

          <Text style={s.hint}>
            Quando ativo, a tela de Contagem mantém um campo focado “invisível” para
            receber os códigos do leitor (teclado/HID) e somar a quantidade se o
            código já existir.
          </Text>
        </Section>

        {/* Importar Produtos */}
        <Section title="Importar Produtos">
          <Text style={[s.text, { marginBottom: 8 }] }>
            Selecione um arquivo <Text style={{ fontWeight: "700" }}>.txt</Text> no layout escolhido acima.
            Separadores aceitos: ponto e vírgula (;), vírgula (,) ou TAB.
          </Text>

          <TouchableOpacity onPress={importarProdutos} style={s.primaryBtn} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Selecionar arquivo .txt</Text>
          </TouchableOpacity>

          {ultimoImport ? (
            <View style={s.importInfo}>
              <Text style={s.small}>Último arquivo: {ultimoImport.nome}</Text>
              <Text style={s.small}>Produtos lidos: {ultimoImport.qtd}</Text>
            </View>
          ) : null}
        </Section>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Componentes auxiliares (não genéricos p/ evitar TSX errors) --- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

type ImportOption = { value: ImportLayout; label: string };
function RadioGroupImport({
  value,
  onChange,
  options,
}: {
  value: ImportLayout;
  onChange: (v: ImportLayout) => void;
  options: ImportOption[];
}) {
  return (
    <View style={s.radioWrap}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[s.radioItem, active && s.radioActive]}
            activeOpacity={0.85}
          >
            <View style={[s.radioDot, active && s.radioDotActive]} />
            <Text style={[s.radioLabel, active && s.radioLabelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type ExportOption = { value: ExportLayout; label: string };
function RadioGroupExport({
  value,
  onChange,
  options,
}: {
  value: ExportLayout;
  onChange: (v: ExportLayout) => void;
  options: ExportOption[];
}) {
  return (
    <View style={s.radioWrap}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[s.radioItem, active && s.radioActive]}
            activeOpacity={0.85}
          >
            <View style={[s.radioDot, active && s.radioDotActive]} />
            <Text style={[s.radioLabel, active && s.radioLabelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ---------------- estilos ------------------------------------------------------ */

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  section: {
    marginTop: 14,
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f7f7f7",
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 10 },

  text: { fontSize: 13, color: "#333" },
  hint: { fontSize: 12, color: "#666", marginTop: 6 },

  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  radioWrap: { gap: 8 },
  radioItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#eee",
  },
  radioActive: { backgroundColor: "#111" },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#666",
    backgroundColor: "transparent",
  },
  radioDotActive: { borderColor: "#fff", backgroundColor: "#fff" },
  radioLabel: { fontSize: 13, color: "#222", fontWeight: "600" },
  radioLabelActive: { color: "#fff" },

  primaryBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#111",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },

  importInfo: { marginTop: 8, gap: 2 },
  small: { fontSize: 12, color: "#444" },

  toggleLabel: { fontSize: 13, color: "#222", fontWeight: "600" },
});
