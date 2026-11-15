-- 0015: office phone is 520-599-7798 (the old 520-245-7897 number is retired).
update public.companies set phone = '520-599-7798' where phone in ('520-245-7897', '5202457897', '(520) 245-7897');
