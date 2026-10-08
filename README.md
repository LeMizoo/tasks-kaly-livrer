# tasks-kaly-livrer

## Historique partagé

L’application affiche les 8 actions récentes au-dessus du tableau et jusqu’aux 50 dernières dans l’historique en bas de page. Les événements d’accès, de connexion et les actions sur les tâches sont partagés via `/api/audit` et stockés dans `data/audit.json` (ou dans le répertoire défini par `DATA_DIR`). Le répertoire de données doit être persistant sur l’hébergeur pour conserver l’historique après un redémarrage.

Lorsqu’une tâche est prise en charge, terminée ou réouverte, les utilisateurs connectés voient une notification dans le tableau. Les pages ouvertes vérifient les nouveaux événements toutes les 10 secondes; la notification reste visible 12 secondes.

Le badge « Connectés » affiche les utilisateurs ayant une page ouverte et une session active. Chaque onglet envoie un signal de présence toutes les 30 secondes; les sessions sans signal depuis 90 secondes sont automatiquement retirées. La liste est partagée par l’API `/api/presence`.
