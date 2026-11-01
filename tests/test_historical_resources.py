"""Source semantics regression tests for newly acquired historical mineral data."""
from collections import defaultdict
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location('historical', Path(__file__).resolve().parents[1]/'scripts/add_historical_resources.py')
history = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(history)


def source(quantity,notes='<null>',unit='Metric tons',basis='Copper content'):
    return {'COMMODITY':'Copper','COMMODITY_FORM':'Mine','FORM_DETAIL':'Unspecified','COUNTRY_OR_REGION':'Chile','YEAR':'2020','QUANTITY':quantity,'UNITS':unit,'UNIT_DETAIL':basis,'STATISTIC_NOTES':notes,'DATA_SOURCE':'MYB_2022_Copper_Table1','TABLE_NOTES':'Publisher table note.'}


class SourceSemantics(unittest.TestCase):
    def test_publisher_sentinels_stay_unavailable_and_literal(self):
        for literal,meaning in [('-111','half'),('-222','withheld'),('-333','available')]:
            with self.subTest(literal=literal):
                record=source(literal);out=history.usgs_cell(record,'CHL',2020,2022,2,[])
                self.assertIsNone(out['value']);self.assertFalse(out['eligible'])
                self.assertEqual(out['raw_value'],literal);self.assertEqual(out['source_record'],record)
                self.assertIn(meaning,out['status'])

    def test_actual_zero_and_estimated_nonzero_are_distinct(self):
        zero=history.usgs_cell(source('0'),'CHL',2020,2022,2,[])
        self.assertEqual(zero['value'],0);self.assertTrue(zero['eligible'])
        estimated=history.usgs_cell(source('123','Estimated. Revised.'),'CHL',2020,2022,3,[])
        self.assertEqual(estimated['value'],123);self.assertTrue(estimated['eligible'])
        self.assertIn('Estimated. Revised.',estimated['status'])

    def test_bounds_not_misread_as_exact_values(self):
        for record in [source('<10'),source('0','Less than ½ unit.')]:
            out=history.usgs_cell(record,'CHL',2020,2022,2,[])
            self.assertFalse(out['eligible']);self.assertEqual(out['source_record'],record)

    def test_latest_null_does_not_fall_back_to_an_older_number(self):
        latest={};ambiguous=defaultdict(list);key=('native-dimensions','CHL',2020)
        history.select_latest(latest,ambiguous,key,2021,2,source('123'))
        history.select_latest(latest,ambiguous,key,2022,3,source('-333'))
        vintage,n,record=latest[key]
        out=history.usgs_cell(record,'CHL',2020,vintage,n,ambiguous.get(key,[]))
        self.assertEqual(out['source_publication_year'],2022);self.assertIsNone(out['value'])

    def test_same_latest_vintage_remains_ambiguous(self):
        latest={};ambiguous=defaultdict(list);key=('native-dimensions','CHL',2020)
        history.select_latest(latest,ambiguous,key,2022,2,source('123'))
        history.select_latest(latest,ambiguous,key,2022,3,source('456'))
        vintage,n,record=latest[key]
        out=history.usgs_cell(record,'CHL',2020,vintage,n,ambiguous[key])
        self.assertFalse(out['eligible']);self.assertEqual(len(out['same_latest_vintage_additional_rows']),1)
        history.select_latest(latest,ambiguous,key,2023,4,source('789'))
        self.assertNotIn(key,ambiguous)

    def test_mass_units_and_material_basis_remain_native_dimensions(self):
        dimensions=lambda r:tuple(r[k] for k in ['COMMODITY','COMMODITY_FORM','FORM_DETAIL','UNITS','UNIT_DETAIL'])
        self.assertNotEqual(dimensions(source('1')),dimensions(source('1',unit='Thousand metric tons')))
        self.assertNotEqual(dimensions(source('1')),dimensions(source('1',basis='Gross weight')))


if __name__=='__main__':unittest.main()
