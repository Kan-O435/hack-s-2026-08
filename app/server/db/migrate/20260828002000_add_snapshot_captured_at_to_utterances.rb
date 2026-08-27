class AddSnapshotCapturedAtToUtterances < ActiveRecord::Migration[8.1]
  def change
    add_column :utterances, :snapshot_captured_at, :datetime
  end
end
