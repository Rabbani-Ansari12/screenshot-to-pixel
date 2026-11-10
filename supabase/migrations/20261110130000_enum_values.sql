-- =============================================================================
-- Extra enum values used by the app. Kept in their own migration because a new
-- enum value cannot be used in the same transaction that adds it.
-- =============================================================================

-- Counted units (cement bags, steel pieces). Still never converted into MT / volume.
alter type public.material_unit add value if not exists 'BAG';
alter type public.material_unit add value if not exists 'NOS';

-- Weights typed in by hand (no slip / no site measurement).
alter type public.measurement_method add value if not exists 'manual_entry';
