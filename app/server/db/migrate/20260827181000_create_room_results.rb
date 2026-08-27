class CreateRoomResults < ActiveRecord::Migration[8.1]
  def change
    create_table :room_results do |t|
      t.references :room, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.integer :total_score, null: false, default: 0
      t.text :critique

      t.timestamps
    end

    add_index :room_results, [ :room_id, :user_id ], unique: true
  end
end
