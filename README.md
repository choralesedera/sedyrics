# Sedyrics Premium — GitHub Ready

Version refondue pour Chorale Sedera Ambalavato, FLM Antsirabe.

## Structure
- `data/songs.json` : catalogue des chansons
- `data/announcements.json` : FILAZAN-DRAHARAHA
- `lyrics/` : paroles
- `solfa/` : solfas
- `instrumentals/` : playbacks
- `assets/` : interface

## Ajouter une chanson
1. Ajouter ses fichiers dans `lyrics/`, `solfa/`, `instrumentals/`.
2. Ajouter une entrée dans `data/songs.json`.
3. Augmenter `revision` de la chanson si un de ses fichiers change.
4. Augmenter `contentVersion` dans `version.json` si le catalogue change.

## Repères playback
Chaque chanson peut avoir dans `songs.json` :
```json
"markers": [
  {"label":"Refrain", "time":42.5},
  {"label":"Couplet 2", "time":88.0}
]
```
Les utilisateurs peuvent aussi ajouter leurs propres repères localement dans l'application.

## FILAZAN-DRAHARAHA
Modifier `data/announcements.json` :
```json
{
  "announcements": [
    {"id":1,"date":"2026-09-21","title":"Titre","body":"Texte de l'annonce"}
  ]
}
```
Puis augmenter `contentVersion` dans `version.json`.

## Notes
Les notes générales et notes par chanson sont auto-sauvegardées dans `localStorage` du WebViewer.

## Kodular
WebViewer :
`https://VOTRE-UTILISATEUR.github.io/sedyrics/`

### Bouton Retour Android recommandé
Ajouter un `Notifier` dans Kodular.
- `Screen1.BackPressed`
- si `Afficheur_Web1.CanGoBack` : `Afficheur_Web1.GoBack`
- sinon afficher une boîte : `Quitter l'application ?`
- si l'utilisateur choisit `Quitter`, utiliser le bloc Kodular de fermeture de l'application.

Les notes étant auto-sauvegardées pendant la saisie, une fermeture accidentelle ne doit pas perdre le texte déjà saisi.

## Offline
Le Service Worker garde l'interface, le catalogue, les annonces, les paroles et solfas en cache. Les instrumentaux sont mis en cache à leur première ouverture, sauf si `prefetch.instrumentals` est passé à `true` dans `version.json`.
