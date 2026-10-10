# LyriCSED Android - branche de test hors connexion

Cette branche ne modifie pas `main`, le site GitHub Pages ni l'APK déjà distribué.

## Construire la page locale
GitHub Actions > **Build LyriCSED Android offline HTML** > récupérer l'artefact **LyriCSED-Android-Kodular-HTML**.

Le fichier `lyricsed-local.html` reprend l'interface existante sans la redessiner, avec un catalogue de départ, les paroles et la solfa intégrées. Les MP3 restent à synchroniser après connexion.

## Kodular
1. Sauvegarder le projet original .aia, importer une copie.
2. Dans **Media/Assets**, importer `lyricsed-local.html`.
3. Dans l'écran d'accueil, configurer le WebViewer principal sur `http://localhost/lyricsed-local.html` (vérifier le schéma d'assets adapté à la version Kodular sur votre appareil).
4. Conserver les blocs de commande audio et WebViewString existants.
5. Compiler l'APK dans Kodular, non dans GitHub Actions.
6. Tester dès la première ouverture en mode avion, les 28 chants de départ, la lecture des paroles, puis la synchronisation en ligne et les MP3 hors ligne.

## Limites importantes
- La page HTML ne protège pas les données; l'accès des membres via Ankino License Hub est une étape distincte, non incluse.
- GitHub Actions prépare le HTML, pas le fichier .aia ni l'APK.
- Selon Android WebView et sa politique de stockage/cache, les MP3 téléchargés peuvent ne pas être persistants. La persistance sur téléphone, la lecture native et la rétention des données nécessitent validation sur appareil.
- Ne pas fusionner cette branche sans validation du fonctionnement Kodular et du mode hors connexion.
