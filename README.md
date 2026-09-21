# Sedyrics

Structure prête pour GitHub Pages et Kodular.

## Ajouter une chanson
1. Ajouter le fichier paroles dans `lyrics/`.
2. Ajouter le solfa dans `solfa/` si disponible.
3. Ajouter l'instrumental dans `instrumentals/` si disponible.
4. Ajouter/modifier l'entrée dans `data/songs.json`.
5. Pour une chanson modifiée, augmenter son champ `revision`.
6. Pour une nouvelle liste/catalogue, augmenter `contentVersion` dans `version.json`.
7. Commit/push sur GitHub.

Les paroles et solfas sont préchargés pour le hors connexion. Les instrumentaux sont mis en cache lors de leur première ouverture par défaut. Pour précharger tous les instrumentaux, mettre `prefetch.instrumentals` à `true` dans `version.json` (attention à la consommation de données et de stockage).
