export function labResultIdentityKey(result: Record<string, unknown>) {
  return [
    result.RekvisitionsId,
    result.AnalysetypeId,
    result.Resultatdato,
    result.Resultat,
    result.Vaerdi,
    result.ProevenummerRekvirent,
    result.ProevenummerLaboratorie
  ].join("\u001f");
}
