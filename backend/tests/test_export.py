import json

from conftest import reference_fixings

from export_static import export


@reference_fixings
def test_export_static_identical_to_api(tmp_path, client):
    m = export(tmp_path)
    assert m["mode"] == "static" and m["n_files"] > 200
    for f in m["files"][:40] + [x for x in m["files"] if "headline" in x["file"] or "CP0452" in x["file"]]:
        on_disk = json.loads((tmp_path / f["file"]).read_text(encoding="utf-8"))
        assert on_disk == client.get(f["route"]).json(), f["route"]
    assert (
        json.loads((tmp_path / "headline/EA.json").read_text(encoding="utf-8"))["data"][2]["market"] == 4.23
    )
