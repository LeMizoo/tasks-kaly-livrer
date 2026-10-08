# tasks-kaly-livrer

## Réutiliser l’application pour un autre projet

Le tableau, les membres, les catégories, les priorités et les modèles sont définis dans `config/app.json`. Ce fichier contient la configuration Kaly par défaut. Pour créer une autre instance :

1. Copiez `config/app.example.json` vers un fichier de configuration propre au projet.
2. Personnalisez `app`, `team`, `sections`, `priorities` et `tasks`. Les identifiants de tâches, sections et priorités doivent être uniques et utiliser des lettres, chiffres, tirets ou tirets bas.
3. Ajoutez les modèles prêts à copier dans `templates`, avec leur extension de téléchargement dans `templateExtensions`. Les modèles sont facultatifs.
4. Démarrez l’application avec `APP_CONFIG_FILE` pointant vers votre fichier et attribuez un `storageNamespace` unique au projet.

```powershell
Copy-Item config\app.example.json config\mon-projet.json
$env:APP_CONFIG_FILE = "config\mon-projet.json"
$env:DATA_DIR = "D:\app-data\mon-projet"
npm install
npm test
npm start
```

Le serveur valide la configuration au démarrage et la fournit à l’interface via `/api/config`. Une configuration invalide arrête le démarrage avec un message explicite. `PORT` règle le port HTTP (8080 par défaut), `APP_CONFIG_FILE` le fichier de configuration et `DATA_DIR` le répertoire de données de l’instance.

Chaque déploiement indépendant doit utiliser son propre `DATA_DIR` persistant : il contient les tâches, comptes, commentaires, échéances, modèles modifiés et historique. Ces fichiers de données ne sont pas versionnés. Gardez aussi `storageNamespace` propre à chaque projet pour séparer les données locales des navigateurs. Le fichier de configuration du projet, en revanche, doit être livré avec son déploiement.

Les membres déclarés dans `team.members` peuvent créer leur code PIN lors de leur première connexion. Les tâches déjà sauvegardées restent intactes lorsqu’on modifie la configuration ; les identifiants retirés de celle-ci ne sont simplement plus affichés ni acceptés pour de nouvelles modifications.

## Historique partagé

L’application affiche les 8 actions récentes au-dessus du tableau et jusqu’aux 50 dernières dans l’historique en bas de page. Les événements d’accès, de connexion et les actions sur les tâches sont partagés via `/api/audit` et stockés dans `data/audit.json` (ou dans le répertoire défini par `DATA_DIR`). Le répertoire de données doit être persistant sur l’hébergeur pour conserver l’historique après un redémarrage.

Lorsqu’une tâche est prise en charge, terminée ou réouverte, les utilisateurs connectés voient une notification dans le tableau. Les pages ouvertes vérifient les nouveaux événements toutes les 10 secondes; la notification reste visible 12 secondes.

Le badge « Connectés » affiche les utilisateurs ayant une page ouverte et une session active. Chaque onglet envoie un signal de présence toutes les 30 secondes; les sessions sans signal depuis 90 secondes sont automatiquement retirées. La liste est partagée par l’API `/api/presence`.

Le bouton « Message aux connectés », près du badge, diffuse une notification aux sessions actives au moment de l’envoi. Les messages sont limités à 500 caractères et ajoutés à l’historique partagé (`audit.json`); l’historique affiche les 50 entrées récentes et en conserve jusqu’à 500 côté serveur. Le répertoire de données doit être persistant sur l’hébergeur pour les conserver après un redémarrage. La notification reste visible 12 secondes.

## Données partagées et sauvegardées

L’état des tâches (avancement et affectations), les sous-tâches, les échéances et les commentaires sont partagés entre les navigateurs et enregistrés sur le serveur. Les modifications sont sauvegardées immédiatement; les pages ouvertes récupèrent les changements des autres utilisateurs toutes les 10 secondes. L’historique partagé enregistre également les actions.

Les données sont conservées dans `data/tasks.json`, `data/meta.json`, `data/comments.json` et `data/audit.json`, ou dans le répertoire défini par `DATA_DIR`. Au premier chargement, les commentaires, sous-tâches, échéances et états de tâches existants dans le stockage local du navigateur sont transférés vers le serveur. Le répertoire de données de l’hébergement doit être persistant pour conserver les modifications après un redémarrage. Si le serveur est indisponible, les modifications restent dans le navigateur et l’application affiche un avertissement de synchronisation.

Les modèles prêts à copier peuvent être modifiés dans leur éditeur, copiés ou téléchargés. Ils sont sauvegardés et partagés via `/api/templates` dans `data/templates.json`; le bouton du modèle devient orange et porte la mention « modifié » lorsque son contenu diffère du modèle initial.

## Développement et tests

```sh
npm install
npm test
npm start
```

La suite de tests API utilise des données temporaires et ne modifie pas les données du projet. Le workflow GitHub Actions exécute ces tests à chaque push sur `main` et à chaque pull request. L’ancien `setup.py`, qui réécrivait les fichiers de l’application et lançait des commandes Git, a été retiré ; la configuration JSON documentée ci-dessus est la méthode prise en charge.
