# tasks-kaly-livrer

## Historique partagé

L’application affiche les 8 actions récentes au-dessus du tableau et jusqu’aux 50 dernières dans l’historique en bas de page. Les événements d’accès, de connexion et les actions sur les tâches sont partagés via `/api/audit` et stockés dans `data/audit.json` (ou dans le répertoire défini par `DATA_DIR`). Le répertoire de données doit être persistant sur l’hébergeur pour conserver l’historique après un redémarrage.

Lorsqu’une tâche est prise en charge, terminée ou réouverte, les utilisateurs connectés voient une notification dans le tableau. Les pages ouvertes vérifient les nouveaux événements toutes les 10 secondes; la notification reste visible 12 secondes.

Le badge « Connectés » affiche les utilisateurs ayant une page ouverte et une session active. Chaque onglet envoie un signal de présence toutes les 30 secondes; les sessions sans signal depuis 90 secondes sont automatiquement retirées. La liste est partagée par l’API `/api/presence`.

Le bouton « Message aux connectés », près du badge, diffuse une notification aux sessions actives au moment de l’envoi. Les messages sont limités à 500 caractères et ajoutés à l’historique partagé (`audit.json`); l’historique affiche les 50 entrées récentes et en conserve jusqu’à 500 côté serveur. Le répertoire de données doit être persistant sur l’hébergeur pour les conserver après un redémarrage. La notification reste visible 12 secondes.

## Données partagées et sauvegardées

L’état des tâches (avancement et affectations), les sous-tâches, les échéances et les commentaires sont partagés entre les navigateurs et enregistrés sur le serveur. Les modifications sont sauvegardées immédiatement; les pages ouvertes récupèrent les changements des autres utilisateurs toutes les 10 secondes. L’historique partagé enregistre également les actions.

Les données sont conservées dans `data/tasks.json`, `data/meta.json`, `data/comments.json` et `data/audit.json`, ou dans le répertoire défini par `DATA_DIR`. Au premier chargement, les commentaires, sous-tâches, échéances et états de tâches existants dans le stockage local du navigateur sont transférés vers le serveur. Le répertoire de données de l’hébergement doit être persistant pour conserver les modifications après un redémarrage. Si le serveur est indisponible, les modifications restent dans le navigateur et l’application affiche un avertissement de synchronisation.
