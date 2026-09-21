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


## Version v4 - Offline First

Cette version change complètement la synchronisation :

- au premier lancement avec Internet, LyriCSED télécharge les paroles, solfas,
  instrumentaux, images et données de toutes les chansons ;
- après cette première synchronisation, le contenu reste disponible hors connexion ;
- à chaque ouverture avec Internet, l'application vérifie les nouveautés ;
- une chanson déjà présente n'est pas retéléchargée si son fichier et sa révision
  n'ont pas changé ;
- le bouton Actualiser ne supprime plus jamais le cache avant de vérifier Internet ;
- une mise à jour est préparée dans un cache temporaire puis appliquée seulement
  si tous les téléchargements nécessaires ont réussi ;
- si la connexion échoue, la version locale précédente reste intacte ;
- aucun message d'erreur dans l'application n'affiche l'adresse GitHub.

### Modification d'une chanson

Le champ `revision` reste compatible. Pour éviter de retélécharger un gros playback
lorsque seule la parole change, on peut aussi utiliser :

```json
"revisions": {
  "lyrics": 2,
  "solfa": 1,
  "instrumental": 1,
  "image": 0
}
```

Ainsi, si seul `lyrics` passe de 1 à 2, seul le fichier de paroles concerné est téléchargé.

### Important

L'URL GitHub Pages peut être masquée dans l'interface et les messages, mais elle ne peut
pas être rendue secrète si les fichiers sont publiquement accessibles sur GitHub Pages.
Un utilisateur technique pourrait toujours la retrouver en inspectant l'application
ou le trafic réseau.

Pour Kodular, le WebViewer continue d'ouvrir la page GitHub Pages. Après la première
synchronisation complète, le Service Worker sert la copie locale lorsque le téléphone
est hors connexion.


## Version v5 - Playlists & Planning

### PLAYBACK LITURGIE
Sections locales :
- PRÉLUDE
- INTERLUDE
- RAKITRA

Chaque section accepte :
- un ou plusieurs playbacks déjà présents dans LyriCSED ;
- des fichiers audio choisis sur le téléphone (MP3, WAV, MPEG, M4A, AAC, OGG, FLAC lorsque le WebView Android sait les décoder).

Les morceaux peuvent être montés, descendus ou supprimés. Un bouton permet de lire une section ou toute la liturgie dans l'ordre.

### CONCERT / ANTSAM-PANAHY
Sections :
- PARTIE I
- PARTIE II
- PARTIE III

Même fonctionnement, avec lecture automatique du morceau suivant.

### Stockage local des fichiers du téléphone
Les fichiers choisis sur le téléphone sont copiés dans IndexedDB, donc ils restent associés à LyriCSED hors connexion.
Supprimer un morceau de la playlist supprime également sa copie locale lorsqu'aucune autre playlist ne l'utilise.

### Tonalité
Le pitch shifting n'est pas activé dans cette version.
Un changement de tonalité indépendant du tempo demande un traitement DSP/AudioWorklet/WASM plus lourd et peut créer des coupures ou des artefacts selon le téléphone.
Pour un usage liturgique ou concert, la priorité de cette version est la stabilité du playback.
Aucune détection automatique approximative de tonalité n'est ajoutée.

### Kodular / fichiers locaux
La sélection locale utilise le sélecteur HTML `input type=file`.
Sur la plupart des WebView Android récents, le sélecteur système s'ouvre.
Si le WebViewer Kodular utilisé sur un appareil précis ne relaie pas le sélecteur de fichiers, il faudra connecter le composant de sélection de fichier de Kodular à cette même logique locale.


## Version v6 - Liturgie et Concert séparés

- LITURGIE est une section autonome.
- PLANNING CONCERT / ANTSAM-PANAHY est une section autonome.
- Liturgie contient : PRÉLUDE, INTERLUDE, RAKITRA et POSTLUDE.
- Le lecteur de playlist est placé en haut des pages Liturgie / Concert.
- La lecture continue quand l'utilisateur consulte Accueil, Hira, Lyrics, Solfa,
  Vaovao, Notes ou À propos.
- L'en-tête reste visible dans la fiche d'un chant.
- Lorsqu'un playback événementiel est actif, l'en-tête affiche un mini-indicateur
  avec disque animé, titre et Lecture/Pause.
- Un appui sur ce mini-indicateur ouvre un mini-lecteur Précédent / Lecture-Pause /
  Suivant, avec accès direct au lecteur complet.
- Le lecteur indique le prochain playback et jusqu'à trois morceaux suivants.
- Délai général configurable : 0, 5, 10, 15, 30 secondes ou durée personnalisée.
- Chaque morceau peut utiliser le délai global ou un délai individuel 0/5/10/15/30 s.
- Pendant le délai, un compte à rebours est affiché et « Lancer maintenant » permet
  de démarrer immédiatement le morceau suivant.
- La faute « fhasoavana » a été corrigée en « fahasoavana ».
- Les petites polices des playlists ont été agrandies.
- Les commandes internes de taille des Lyrics A-/A+ ont été modernisées.

### Zoom WebViewer Kodular
Les boutons + / - Android qui apparaissent en bas à droite ne sont pas créés par
index.html. Les seuls contrôles de taille ajoutés par LyriCSED sont ceux de la barre
« Haben'ny soratra ». Si le WebViewer Kodular affiche ses propres contrôles de zoom,
désactivez l'affichage/activation du zoom dans les propriétés du WebViewer, puis
utilisez les commandes de taille intégrées à LyriCSED.
