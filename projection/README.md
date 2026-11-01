# LyriCSED Projection • Tauri 2
Logiciel Windows hors ligne, régie de chants, vidéoprojecteur et fonds image/vidéo.
La branche GitHub `lyricsed-projection-tauri` ne modifie pas `main` (Android).
## EXE par GitHub
Ouvrez l'onglet **Actions**, le workflow **LyriCSED Projection Windows**, puis le dernier run; téléchargez l'artifact `LyriCSED-Projection-Windows-Setup` et extrayez-le pour retrouver le Setup .exe. Le workflow se lance après un push sur cette branche. Un build Windows réel est nécessaire pour valider l'exécutable.
## Chants
Au premier lancement, la bibliothèque est vide. Utilisez **Importer TXT / JSON** avec le fichier `songs.json` de l'archive MVP fournie séparément. Format: [{"id":"1","title":"Titre","lyrics":"Strophe 1\\n\\nStrophe 2"}]. Les chants sont conservés localement.
## Projection
Connectez le second écran; choisissez **Étendre ces affichages** dans Windows; cliquez **Ouvrir la projection**. Pour fond vidéo, utilisez de préférence MP4 H.264.
## Note
Le build peut nécessiter des ajustements de compilation selon les versions Windows/Tauri. Ne pas utiliser en culte sans test préalable. Aucun transfert réseau de données n'est requis.
