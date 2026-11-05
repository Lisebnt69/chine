-- Feuille de route : le détail de chaque étape du Programme.
-- planning_slots.etape : titre, durée, comment y aller, ce qu'on y fait, plan B, conseil, sources.
-- planning.route : réveil et résumé du jour.
-- Les étapes logistiques (consigne, check-in) sont des items de type 'etape' : hors des onglets, mais sur le trajet.
-- Relançable sans risque.
alter table public.planning_slots add column if not exists etape jsonb;
alter table public.planning add column if not exists route jsonb;
