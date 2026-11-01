"""Regression checks for source energy units, symbols and reporting identities."""
import importlib.util
from pathlib import Path
import unittest

SPEC=importlib.util.spec_from_file_location('early_energy',Path(__file__).resolve().parents[1]/'scripts/add_early_energy.py')
energy=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(energy)


class EnergySourceSemantics(unittest.TestCase):
    def test_real_zero_and_negative_are_retained(self):
        self.assertEqual(energy.number(0),0)
        self.assertEqual(energy.number('0'),0)
        self.assertEqual(energy.number(-1.25),-1.25)
        self.assertEqual(energy.number('-.25'),-.25)

    def test_source_symbols_never_become_zero(self):
        for literal in ['--','NA','ie','w','(s)','<0.0005','',None]:
            with self.subTest(literal=literal):self.assertIsNone(energy.number(literal))

    def test_offshore_geometry_hint_does_not_become_national_total(self):
        current={'USA','DEU','FRA'}
        whole={'series_id':'INTL.57-1-USA-TBPD.A','geography':'USA'}
        offshore={'series_id':'INTL.57-1-USOH-TBPD.A','geography':'USA'}
        old_germany={'series_id':'INTL.57-1-DEUW-TBPD.A','geography':'DEU'}
        self.assertTrue(energy.eia_is_current_country(whole,current))
        self.assertFalse(energy.eia_is_current_country(offshore,current))
        self.assertFalse(energy.eia_is_current_country(old_germany,current))

    def test_aggregate_never_becomes_country(self):
        self.assertFalse(energy.eia_is_current_country({'series_id':'INTL.44-1-WORL-QBTU.A','geography':'USA+CAN+FRA'},{'USA','CAN','FRA'}))

    def test_physical_and_energy_content_source_units_are_explicit(self):
        self.assertEqual(energy.PHYSICAL['Coal production'],'thousand short tons')
        self.assertEqual(energy.PHYSICAL['Total energy production'],'quadrillion Btu')
        self.assertEqual(energy.PHYSICAL['Electricity installed capacity'],'million kilowatts')
        self.assertEqual(energy.PHYSICAL['Electricity net generation'],'billion kilowatthours')


if __name__=='__main__':unittest.main()
