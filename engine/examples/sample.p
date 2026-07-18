# Sample label sources.
# Each non-blank line is one label. '%' and '#' start comments.

% Antibiotic course: wash hands first, then take a pill twice a day with food
\hand_wash \twice_daily{\pill_bottle{\food_bowl}}

% Eye drops twice a day; do not use if pregnant
\hand_wash \twice_daily{\dropper_bottle{\body_eye}} \no{\state_pregnant}

% Half a tablet three times a day, taken with water
\three_times_daily{\half{\pill_bottle{\water_glass}}}

% Inhaler in the morning and evening (two label steps)
\inhaler{\time_morning} \inhaler{\time_evening}

% Topical cream applied to skin twice a day
\hand_wash \twice_daily{\cream_tube{\body_skin}}

% Glucose check on an empty stomach in the morning
\hand_wash \glucometer{\food_empty_bowl}{\time_morning}

% Suppository at night; keep medicine in fridge
\suppository{\time_night}{\storage_fridge}

% Do not take if breastfeeding; otherwise take at noon four times across the day
\no{\state_breastfeeding} \four_times_daily{\pill_bottle{\time_noon}}
