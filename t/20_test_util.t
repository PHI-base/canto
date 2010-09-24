use strict;
use warnings;
use Test::More tests => 14;
use Test::Exception;
use File::Temp qw(tempfile);
use Data::Compare;
use File::Copy qw(copy);

use PomCur::TestUtil;
use PomCur::Track::LoadUtil;

{
  my $config = {};
  my $file_name = '/tmp/test_file.sqlite3';
  my $schema = PomCur::TestUtil::schema_for_file($config, $file_name, 'Curs');

  my $storage = $schema->storage();

  is ($storage->connect_info()->[0], "dbi:SQLite:dbname=$file_name");
}

{
  my $test_util = PomCur::TestUtil->new();

  ok(ref $test_util);

  throws_ok { $test_util->init_test('_no_such_config_') } qr(no test case);

}

{
  my $test_util = PomCur::TestUtil->new();

  ok(ref $test_util);

  $test_util->init_test('empty_db');

  is($test_util->track_schema()->resultset('Pub')->count(), 0);
  is($test_util->track_schema()->resultset('Gene')->count(), 0);
}

{
  my $test_util = PomCur::TestUtil->new();

  ok(ref $test_util);

  $test_util->init_test('1_curs');

  is($test_util->track_schema()->resultset('Pub')->count(), 16);
  is($test_util->track_schema()->resultset('Gene')->count(), 7);
}

{
  # test _process_data()

  my $config = PomCur::Config::get_config();
  $config->merge_config($config->{test_config_file});

  my $annotations_conf =
    $config->{test_config}->{test_cases}->
        {curs_annotations_1}->[0]->{annotations}->[0];

  my ($fh, $temp_db) = tempfile();

  package MockObject;

  sub new {
    my $class = shift;
    my $table = shift;
    my $id = shift;

    return bless { table => $table, id => $id }, 'MockObject';
  }

  sub table {
    my $self = shift;
    return $self->{table}
  }

  sub gene_id {
    my $self = shift;
    return $self->{id}
  }

  sub pub_id {
    my $self = shift;
    return $self->{id}
  }

  sub primary_columns {
    my $self = shift;
    return $self->{table} . '_id';
  }

  package main;

  package MockCursDB;

  sub find_with_type {
    my $self = shift;
    my $class_name = shift;
    my $hash = shift;

    my $field_name = (keys %$hash)[0];
    my $field_value = $hash->{$field_name};

    my %res = (
      'Gene' => {
        primary_identifier => {
          'SPCC1739.10' => 200
        }
      },
      'Pub' => {
        pubmedid => {
          18426916 => 300
        }
      }
    );

    my $obj_id = $res{$class_name}->{$field_name}->{$field_value};
    my $table = PomCur::DB::table_name_of_class($class_name);

    return MockObject->new($table, $obj_id);
  }

  package main;

  my $test_curs_db = bless {}, 'MockCursDB';

  my $results =
    PomCur::TestUtil::_process_data($test_curs_db, $annotations_conf);

  is ($results->{data}->{gene}, 200);
  is ($results->{pub}, 300);
}

sub track_init
{
  my $track_schema = shift;

  $track_schema->create_with_type('Person',
                                  {
                                    networkaddress => 'kevin.hardwick@ed.ac.uk',
                                    name => 'Kevin Hardwick',
                                    role => 'user'
                                  });
  $track_schema->create_with_type('Cv',
                                  {
                                    cv_id => 50,
                                    name => 'Test CV'
                                  });
  $track_schema->create_with_type('Cvterm',
                                  {
                                    cvterm_id => 601,
                                    cv_id => 50,
                                    name => 'Test pub type',
                                  });
  $track_schema->create_with_type('Pub',
                                  {
                                    pubmedid => 18426916,
                                    title => 'test title',
                                    type_id => 601
                                  });
  $track_schema->create_with_type('Organism',
                                  {
                                    organism_id => 1000,
                                    genus => 'Schizosaccharomyces',
                                    species => 'pombe',
                                  });
  $track_schema->create_with_type('Gene',
                                  {
                                    primary_identifier => 'SPCC1739.11c',
                                    product =>
                                      'SIN component scaffold protein, centriolin ortholog Cdc11',
                                    primary_name => 'cdc11',
                                    organism => 1000
                                  });
  $track_schema->create_with_type('Gene',
                                  {
                                    primary_identifier => 'SPCC1739.10',
                                    product => 'conserved fungal protein',
                                    organism => 1000
                                  });
}

{
  # test make_curs_db

  my $config = PomCur::Config::get_config();
  $config->merge_config($config->{test_config_file});

  my $curs_config =
    $config->{test_config}->{test_cases}->{curs_annotations_1}->[0];

  my $track_db_template_file = $config->{track_db_template_file};

  my ($fh, $temp_track_db) = tempfile();

  copy $track_db_template_file, $temp_track_db or die "$!\n";

  my $track_schema =
    PomCur::TestUtil::schema_for_file($config, $temp_track_db, 'Track');

  track_init($track_schema);

  my $load_util = PomCur::Track::LoadUtil->new(schema => $track_schema);

  my ($cursdb_schema, $cursdb_file_name) =
    PomCur::TestUtil::make_curs_db($config, $curs_config,
                                   $track_schema, $load_util);

  my @res_annotations = $cursdb_schema->resultset('Annotation')->all();

  is (@res_annotations, 1);

  my $res_annotation = $res_annotations[0];

  my $annotation_conf = $curs_config->{annotations}->[0];

  is ($res_annotation->pub()->pubmedid(), $annotation_conf->{'Pub:pubmedid'});

  my $gene_identifier = $annotation_conf->{data}->{'Gene:primary_identifier'};
  my $gene = $cursdb_schema->find_with_type('Gene',
                                            {
                                              primary_identifier => $gene_identifier,
                                            });

  is ($res_annotation->data()->{'gene'},
      $gene->gene_id());
}
