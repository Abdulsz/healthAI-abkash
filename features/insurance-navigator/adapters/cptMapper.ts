import { CptMappingResult } from "../domain/contracts";

const PROCEDURE_KEYWORDS: Array<{ keywords: string[]; result: CptMappingResult }> = [
  {
    keywords: ["mri", "magnetic resonance"],
    result: { cpt_code: "73721", procedure_name: "MRI lower extremity joint" },
  },
  {
    keywords: ["x-ray", "xray", "radiograph"],
    result: { cpt_code: "73030", procedure_name: "Diagnostic x-ray imaging" },
  },
  {
    keywords: ["ct", "cat scan", "computed tomography"],
    result: { cpt_code: "70450", procedure_name: "CT scan without contrast" },
  },
  {
    keywords: ["ultrasound", "sonogram"],
    result: { cpt_code: "76700", procedure_name: "Abdominal ultrasound" },
  },
  {
    keywords: ["physical therapy", "pt session", "rehab"],
    result: { cpt_code: "97110", procedure_name: "Therapeutic exercise session" },
  },
];

const DEFAULT_CPT_RESULT: CptMappingResult = {
  cpt_code: "99213",
  procedure_name: "Office or outpatient established patient visit",
};

export function mapProcedureToCpt(procedureDescription: string): CptMappingResult {
  const normalized = procedureDescription.trim().toLowerCase();

  for (const mapping of PROCEDURE_KEYWORDS) {
    if (mapping.keywords.some((keyword) => normalized.includes(keyword))) {
      return mapping.result;
    }
  }

  return DEFAULT_CPT_RESULT;
}
