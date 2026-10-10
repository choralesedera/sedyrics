# LyriCSED - Accès réservé aux membres (version test)

## Ce qui est prêt dans cette branche
- `kodular/lyricsed-access-gate.js`: écran d'activation LY- dans le HTML local de l'APK
- `scripts/build-lyricsed-local.py`: génère automatiquement `lyricsed-local.html` avec cet écran
- `cloudflare/LYRICSED-D1.sql`: migration sans modification de ZAITRKO/COUTIFLOW
- `.github/workflows/build-kodular-offline.yml`: fabrique le HTML à importer dans Kodular

`main` est inchangée. Ne pas distribuer l'APK d'essai à tous les membres.

## Première opération Cloudflare (pas encore exécutée)
Cloudflare Dashboard > Storage & databases > D1 > `ankino-license-hub` > Console.
Exécuter le SQL de `cloudflare/LYRICSED-D1.sql`. Contrôler qu'une ligne `LYRICSED` ACTIVE apparaît.

Créer ensuite dans Ankino License Hub une licence **PRO ACTIVE**, associée à `LYRICSED`, pour un membre; code commençant par `LY-` et **un seul appareil**. Si le panneau ne prend pas en charge LY-, son générateur doit être complété sans changer Zaitrako.

## Kodular
Importer le projet d'essai AIA fourni séparément ou importer le `lyricsed-local.html` nouvellement généré dans Media/Assets de votre COPIE Kodular. Le WebViewer doit charger `http://localhost/lyricsed-local.html`; les blocs de l'audio restent intacts. Compiler **APK** dans Kodular. Ne pas écraser la version distribuée.

À la première ouverture, un code membre est requis et `POST https://license.ankino.com/activate` est appelé avec `license_code`, `app_code: LYRICSED`, `device_id`, `app_version`. La réponse doit renvoyer `success:true` et `license.type: PRO`, `license.status: ACTIVE`, `license.app_code: LYRICSED`.

Une licence validée est conservée localement jusqu'à 7 jours après la vérification en ligne. Le serveur refuse un téléphone différent ou une licence désactivée. La désactivation hors ligne n'agit qu'à la prochaine vérification ou expiration de la fenêtre.

## Limites et sécurité
- La base D1 / le Worker actif n'ont PAS été modifiés depuis ici; pas d'accès Cloudflare connecté.
- Le contrôle hors connexion du prototype repose sur le stockage local du WebViewer. **Ce n'est pas une licence cryptographiquement signée** : pour une protection forte, ajouter un jeton signé côté Cloudflare et une vérification de signature locale, puis valider la politique de révocation.
- Les contenus du dépôt GitHub public restent publics, même si l'APK a un écran de connexion.
- Vérifier que le Worker autorise les requêtes CORS provenant de l'origine WebViewer sur Android. Les échecs CORS ne doivent pas être contournés avec une clé ADMIN dans l'APK.
- Le fonctionnement du stockage cache des MP3, des codes et du lecteur natif doit être testé sur un vrai téléphone avant diffusion.

## Tests
1. Sans code / sans Internet : l'écran d'activation reste visible.
2. Code incorrect : refus.
3. Code PRO actif via Internet : accès.
4. Redémarrage en mode avion dans la période de 7 jours : accès.
5. Autre téléphone avec le même code : refus de l'API.
6. Désactivation au Hub : refus à la prochaine vérification en ligne.
