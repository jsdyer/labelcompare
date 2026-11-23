import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from refresh_examples import refresh, validate_config, ROOT


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);(self.root/'web/data').mkdir(parents=True)
        self.config=json.loads((ROOT/'web/config.json').read_text())
        self.save()

    def save(self):
        (self.root/'web/config.json').write_text(json.dumps(self.config))

    def test_expand_collects_added_code_and_derives_count(self):
        self.config['exampleBarcodes'].append('3017620422003');self.config['maxProducts']=8;self.save()
        called=[]
        def fetch(code):
            called.append(code);return {'capturedAt':'2026-01-01T00:00:00Z','raw':{'status':'success','product':{'code':code}}}
        refresh(self.root,fetcher=fetch,sleeper=lambda seconds:None)
        data=json.loads((self.root/'web/data/examples.json').read_text())
        self.assertEqual(called,self.config['exampleBarcodes']);self.assertEqual(len(data['records']),len(self.config['exampleBarcodes']))

    def test_failure_preserves_last_good_copy(self):
        path=self.root/'web/data/examples.json';path.write_text('last good copy')
        def fail(code):raise OSError('provider unavailable')
        with self.assertRaises(OSError):refresh(self.root,fetcher=fail,sleeper=lambda seconds:None)
        self.assertEqual(path.read_text(),'last good copy')

    def test_duplicate_aliases_and_excessive_requests_rejected(self):
        for change in [{'exampleBarcodes':['069000019832','0069000019832']},{'requestsPerMinute':100},{'requestIntervalMs':1},{'maxProducts':True}]:
            with self.subTest(change=change), self.assertRaises(ValueError):validate_config(self.config|change)

    def test_empty_starter_shelf_is_valid(self):
        self.config.update(exampleBarcodes=[],initialBarcodes=[])
        self.assertEqual(validate_config(self.config),[])

if __name__=='__main__':unittest.main()
