import { useState } from "react";
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type TabKey = "historico" | "produtos";

export default function Inicio() {
  const [tab, setTab] = useState<TabKey>("historico");

  return (
    <SafeAreaView style={s.container}>
      {/* Cabeçalho */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LobosTi Contagem</Text>
      </View>

      {/* Abas internas */}
      <View style={s.tabsRow}>
        <TabButton label="Historico" active={tab === "historico"} onPress={() => setTab("historico")} />
        <TabButton label="Produtos" active={tab === "produtos"} onPress={() => setTab("produtos")} />
      </View>

      {/* Conteúdo da aba selecionada */}
      <View style={s.content}>
        {tab === "historico" ? (
          <View style={s.center}>
            <Text style={s.placeholder}>Sem histórico ainda.</Text>
            <Text style={s.hint}>As contagens aparecerão aqui quando forem salvas.</Text>
          </View>
        ) : (
          <View style={s.center}>
            <Text style={s.placeholder}>Nenhum produto carregado.</Text>
            <Text style={s.hint}>Em breve listaremos os produtos para contagem.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.tabBtn, active && s.tabBtnActive]} onPress={onPress}>
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
  },
  tabBtnActive: { backgroundColor: "#111" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#333" },
  tabTextActive: { color: "#fff" },
  content: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 6 },
  placeholder: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 12, color: "#666" },
});
