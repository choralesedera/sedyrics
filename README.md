# LyriCSED Premium — GitHub Ready

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


## Mise à jour manuelle
La version Premium v2 ajoute un bouton **Actualiser** dans l'en-tête.

Il :
1. conserve les notes, favoris et repères locaux ;
2. vide uniquement les caches Sedyrics ;
3. renouvelle le Service Worker ;
4. recharge la dernière version publiée sur GitHub Pages.

**Important :** dans Kodular, le WebViewer doit ouvrir l'URL GitHub Pages
(ex. `https://VOTRE-UTILISATEUR.github.io/sedyrics/`) et non
`http://localhost/index.html`. Si l'application charge encore `localhost`,
les changements de l'interface GitHub ne peuvent pas remplacer les fichiers
HTML/CSS/JS déjà inclus dans l'APK.


## Version v3
- Nom visible : LyriCSED
- Sous-titre : Lyrics Chorale Sedera Ambalavato
- Verset Kolosiana 3:16 ajouté à l'accueil
- Bouton de repère renommé en « Mariho »
- Chaque repère peut être supprimé individuellement
- Les repères du catalogue supprimés par l'utilisateur sont masqués uniquement sur son téléphone
