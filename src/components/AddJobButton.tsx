import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// Opens the full Add Job page. Quick Add is the C shortcut.
export function AddJobButton() {
  return (
    <Button asChild title="Add a job with every field (C for Quick Add)">
      <Link to="/jobs/new"><Plus /> Add Job</Link>
    </Button>
  );
}
