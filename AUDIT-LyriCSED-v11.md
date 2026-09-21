# AUDIT LyriCSED v11

## Base utilisée
Version de départ : LyriCSED v10 REPAIR, donc toutes les corrections précédentes,
les 28 chants, le dernier header, les playlists Liturgie/Concert, le zoom HTML,
les comptes officiels et le mode Offline First sont conservés.

## Lecteur audio
- Nombre d'éléments <audio> dans index.html : 1
- Utilisation de new Audio() dans app.js : 0
- Référence à playlistAudio : 0
- Le même élément audio global pilote Playback, Liturgie, Concert, Antsam-panahy
  et les fichiers audio locaux.
- La navigation entre les vues ne réinitialise plus automatiquement l'audio.
- Le mini-lecteur, le header et le lecteur de planning affichent la même progression.

## Hira
- La liste Hira affiche « Lyrics ihany ».
- Aucun lecteur audio supplémentaire n'est ajouté à la liste Hira.
- Les chants sans Lyrics peuvent toujours apparaître avec l'indication Playback.

## Concert
- Partie I : accent turquoise.
- Partie II : accent doré.
- Partie III : accent violet.
- Les couleurs restent limitées aux bordures, icônes et titres.

## Icônes
Icônes SVG dédiées ajoutées pour :
- Liturgie
- Concert
- Prélude
- Interlude
- Rakitra
- Postlude
- Partie I
- Partie II
- Partie III
- Playback

## À propos
- Facebook : tentative d'ouverture via Android Intent vers l'application Facebook.
- Si l'application n'est pas disponible, l'URL web sert de fallback.
- Ankino MG s'ouvre d'abord dans le WebView courant.

## Catalogue
Nombre de chants conservés : 28
